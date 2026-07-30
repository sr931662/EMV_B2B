const prisma = require('../utils/prisma');

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------
//
// Chosen by EMAIL_TRANSPORT ('console' by default, 'smtp' for a generic SMTP relay, 'ses' for
// Amazon SES). Every transport exposes the same shape: async send({ to, subject, html, text }).

function consoleTransport() {
  return {
    async send({ to, subject, html, text }) {
      const rule = '─'.repeat(70);
      console.log(
        `\n${rule}\n[email:console] To: ${to}\nSubject: ${subject}\n${rule}\n${text || html}\n${rule}\n`
      );
    },
  };
}

/** Pulls the bare address out of either `Name <addr@host>` or a plain `addr@host`. */
function extractAddress(from) {
  const angled = /<([^>]+)>/.exec(String(from ?? ''));
  return (angled ? angled[1] : String(from ?? '')).trim().toLowerCase();
}

// Cached for the same reason as the SES client below: getTransport() runs on every send, and
// createTransport builds a connection pool, which must not be rebuilt per email.
let cachedSmtpTransporter = null;
// The From/auth mismatch below is a config mistake, not a per-email event — warn once per process
// rather than on every send.
let warnedFromMismatch = false;

// Wired but inert until SMTP_* env vars are filled in — the transport is created lazily so
// missing nodemailer config never breaks app boot, only the (caught) send call at send-time.
function smtpTransport() {
  const nodemailer = require('nodemailer');

  if (!cachedSmtpTransporter) {
    cachedSmtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  return {
    async send({ to, subject, html, text }) {
      const from = process.env.SMTP_FROM;

      // No fallback address on purpose. A default here would send real mail under a wrong
      // sender with nothing in the logs to say so — the exact failure this From address is
      // meant to prevent. Refusing to send is the louder, safer outcome.
      if (!from) {
        console.error('[emailService] SMTP_FROM is not set — refusing to send with an unknown sender');
        return;
      }

      // Gmail (and most relays) silently REWRITE the From header to the authenticated account
      // unless the address is that account or a verified "Send mail as" alias. The send still
      // succeeds, so without this warning the only symptom is the wrong sender showing up in
      // someone's inbox — invisible from the server side.
      if (!warnedFromMismatch && process.env.SMTP_USER) {
        const fromAddress = extractAddress(from);
        const authAddress = process.env.SMTP_USER.trim().toLowerCase();

        if (fromAddress !== authAddress) {
          warnedFromMismatch = true;
          console.warn(
            `[emailService] SMTP_FROM address (${fromAddress}) differs from SMTP_USER (${authAddress}). ` +
              'The relay will likely rewrite the From header to the authenticated account, so ' +
              'recipients will see the wrong sender. Authenticate as the From address, or verify ' +
              'it as a "Send mail as" alias on the sending account.'
          );
        }
      }

      await cachedSmtpTransporter.sendMail({ from, to, subject, html, text });
    },
  };
}

/**
 * Amazon SES via the AWS SDK (SESv2 SendEmail).
 *
 * Deliberately the SDK and not SES's SMTP endpoint: on ECS Fargate the task assumes an IAM role,
 * so the SDK picks up short-lived rotating credentials from the container credentials provider and
 * there is no SMTP username/password to store in Secrets Manager or rotate. Locally the same code
 * path works off `aws configure` / AWS_PROFILE / env vars, so dev and prod behave identically.
 *
 * The client is created lazily and cached across calls: constructing it resolves the credential
 * chain, which must not happen at import time (that would make app boot depend on AWS being
 * reachable) but also must not repeat per email.
 */
let cachedSesClient = null;

function sesTransport() {
  const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

  if (!cachedSesClient) {
    // Region: AWS_REGION is set for us by ECS. SES_REGION exists as an override for the case where
    // the sending identity lives in a different region from the rest of the stack.
    cachedSesClient = new SESv2Client({
      region: process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1',
    });
  }

  return {
    async send({ to, subject, html, text }) {
      const command = new SendEmailCommand({
        // Must be a verified identity (domain or address) in this region, or SES rejects the call.
        FromEmailAddress: process.env.SES_FROM_ADDRESS || process.env.SMTP_FROM,
        Destination: { ToAddresses: [to] },
        ...(process.env.SES_REPLY_TO ? { ReplyToAddresses: [process.env.SES_REPLY_TO] } : {}),
        // A configuration set is what routes bounce/complaint/delivery events to SNS and keeps
        // reputation metrics. Optional so the transport still works before one is created.
        ...(process.env.SES_CONFIGURATION_SET
          ? { ConfigurationSetName: process.env.SES_CONFIGURATION_SET }
          : {}),
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              // SES accepts a text part only if non-empty; stripTags can return '' for an
              // empty template body, and an empty Data field is a validation error.
              ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
            },
          },
        },
      });

      const result = await cachedSesClient.send(command);
      // The message id is the only handle for tracing a delivery in SES event logs, so it is worth
      // a line in CloudWatch.
      console.log(`[email:ses] sent to ${to} (messageId=${result.MessageId})`);
    },
  };
}

const TRANSPORTS = {
  console: consoleTransport,
  smtp: smtpTransport,
  ses: sesTransport,
};

function getTransport() {
  const kind = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();
  const factory = TRANSPORTS[kind];

  if (!factory) {
    console.error(
      `[emailService] unknown EMAIL_TRANSPORT "${kind}" — falling back to console. ` +
        `Valid values: ${Object.keys(TRANSPORTS).join(', ')}`
    );
    return consoleTransport();
  }

  return factory();
}

/**
 * Sends one email. Best-effort by design (locked requirement): whatever calls this must
 * succeed or fail independently of whether the email actually went out. Never throws — logs
 * and swallows instead, so a broken SMTP transport can never break a request, let alone roll
 * back a DB transaction it happens to run near.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.error('[emailService] sendEmail called with no "to" address — skipping send');
    return;
  }

  try {
    await getTransport().send({ to, subject, html, text });
  } catch (err) {
    console.error(`[emailService] send to ${to} failed (subject: "${subject}"):`, err.message);
  }
}

// ---------------------------------------------------------------------------
// EmailTemplate-driven content
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** {{placeholder}} interpolation. Missing vars render as empty string rather than "undefined". */
function interpolate(str, vars) {
  return String(str ?? '').replace(PLACEHOLDER_RE, (_match, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
  );
}

/** Crude HTML→text fallback so every email has a text part even though EmailTemplate has only one body field. */
function stripTags(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Used only if a named template is missing from the database — keeps sendTemplatedEmail from
// ever crashing a caller, per the brief ("don't crash"). Real content lives in the seed.
// Shape matches EmailTemplate ({ subject, body }), not the final { subject, html, text } —
// it still goes through the same interpolate() step as a real row below.
function fallbackTemplate(name) {
  return {
    subject: `TravNexa Global — ${name.replace(/_/g, ' ')}`,
    body: `<p>This is an automated notification ({{__templateName}}) whose template is not yet configured.</p>`,
  };
}

/**
 * Loads EmailTemplate by name, interpolates {{vars}}, returns { subject, html, text }.
 * Never throws: an unknown/archived template name falls back to a generic inline message
 * rather than crashing the caller.
 */
async function renderTemplate(name, vars = {}) {
  let template;
  try {
    template = await prisma.emailTemplate.findFirst({ where: { name, archived: false } });
  } catch (err) {
    console.error(`[emailService] failed to load template "${name}":`, err.message);
  }

  const { subject: subjectSrc, body: bodySrc } = template || fallbackTemplate(name);

  const mergedVars = template ? vars : { ...vars, __templateName: name };
  const subject = interpolate(subjectSrc, mergedVars);
  const html = interpolate(bodySrc, mergedVars);

  return { subject, html, text: stripTags(html) };
}

/** Convenience: render + send in one call, still best-effort (never throws). */
async function sendTemplatedEmail(name, to, vars = {}) {
  const { subject, html, text } = await renderTemplate(name, vars);
  await sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, renderTemplate, sendTemplatedEmail };
