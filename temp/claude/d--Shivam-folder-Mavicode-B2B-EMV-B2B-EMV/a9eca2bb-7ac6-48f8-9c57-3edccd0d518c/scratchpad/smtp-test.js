/*
 * Tests the SMTP settings in backend/.env directly.
 *
 * Worth doing standalone because emailService is intentionally best-effort: it logs and swallows
 * send failures so a broken mailer can never fail a request. That means the app can look like it
 * worked while nothing was delivered — exactly the situation being debugged.
 *
 * Step 1 verify()  — proves host/port/TLS/credentials are correct, sends nothing.
 * Step 2 sendMail() — one real message, to the account's own address.
 */
const path = require('path');
const BACKEND = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/backend';

require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});
const nodemailer = require(path.join(BACKEND, 'node_modules/nodemailer'));

const recipient = process.argv[2];

const cfg = {
  transport: process.env.EMAIL_TRANSPORT,
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM,
};

console.log('=== resolved config ===');
console.log(`  EMAIL_TRANSPORT : ${cfg.transport}`);
console.log(`  SMTP_HOST       : ${cfg.host}`);
console.log(`  SMTP_PORT       : ${cfg.port}`);
console.log(`  SMTP_USER       : ${cfg.user}`);
console.log(`  SMTP_PASS       : ${cfg.pass ? `set (${cfg.pass.length} chars)` : 'MISSING'}`);
console.log(`  SMTP_FROM       : ${cfg.from}`);
console.log('');

const problems = [];
if (cfg.transport !== 'smtp') problems.push(`EMAIL_TRANSPORT is "${cfg.transport}" — must be "smtp" to actually send`);
if (!cfg.host || cfg.host.includes('example.com')) problems.push(`SMTP_HOST is still a placeholder: "${cfg.host}"`);
if (!cfg.user || !cfg.pass) problems.push('SMTP_USER / SMTP_PASS missing');
// Gmail app passwords are 16 chars; they're often pasted with the spaces Google displays.
if (cfg.host === 'smtp.gmail.com' && cfg.pass && cfg.pass.replace(/\s/g, '').length !== 16) {
  problems.push(`SMTP_PASS is ${cfg.pass.length} chars — a Gmail app password is 16`);
}

if (problems.length) {
  console.log('=== config problems ===');
  problems.forEach((p) => console.log(`  ! ${p}`));
  console.log('');
}

(async () => {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 587 uses STARTTLS, not implicit TLS
    auth: { user: cfg.user, pass: cfg.pass },
  });

  console.log('=== step 1: verify() — handshake + auth, no send ===');
  try {
    await transporter.verify();
    console.log('  PASS: server accepted the credentials\n');
  } catch (err) {
    console.log(`  FAIL: ${err.message}`);
    if (/Invalid login|Username and Password not accepted|BadCredentials/i.test(err.message)) {
      console.log('\n  Cause: Gmail rejected the login. Checklist:');
      console.log('    - 2-Step Verification must be ON for the account');
      console.log('    - the password must be an APP PASSWORD, not the account password');
      console.log('    - remove any spaces Google showed when it generated it');
      console.log('    - the app password belongs to the same account as SMTP_USER');
    } else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
      console.log('\n  Cause: could not reach the SMTP server — DNS, firewall, or port 587 blocked.');
    }
    process.exit(1);
  }

  if (!recipient) {
    console.log('No recipient argument — skipping the real send.');
    console.log('Re-run as: node smtp-test.js you@example.com');
    return;
  }

  console.log(`=== step 2: sending one real email to ${recipient} ===`);
  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: recipient,
      subject: 'TravNexa Global — SMTP test',
      text: 'If you are reading this in your inbox, SMTP is configured correctly and OTP emails will be delivered.',
      html: '<p>If you are reading this in your inbox, SMTP is configured correctly and OTP emails will be delivered.</p>',
    });
    console.log(`  PASS: accepted=${JSON.stringify(info.accepted)} messageId=${info.messageId}`);
    console.log(`  server response: ${info.response}`);
    console.log('\n  Check the inbox (and Spam — a new sender often lands there first).');
  } catch (err) {
    console.log(`  FAIL: ${err.message}`);
    process.exit(1);
  }
})();
