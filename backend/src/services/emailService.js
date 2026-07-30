const prisma = require('../utils/prisma');

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------
//
// Chosen by EMAIL_TRANSPORT ('console' by default, 'smtp' when creds exist). Both transports
// expose the same shape: async send({ to, subject, html, text }).

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

// Wired but inert until SMTP_* env vars are filled in — the transport is created lazily so
// missing nodemailer config never breaks app boot, only the (caught) send call at send-time.
function smtpTransport() {
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  return {
    async send({ to, subject, html, text }) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'TravNexa Global <no-reply@example.com>',
        to,
        subject,
        html,
        text,
      });
    },
  };
}

function getTransport() {
  const kind = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();
  return kind === 'smtp' ? smtpTransport() : consoleTransport();
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
