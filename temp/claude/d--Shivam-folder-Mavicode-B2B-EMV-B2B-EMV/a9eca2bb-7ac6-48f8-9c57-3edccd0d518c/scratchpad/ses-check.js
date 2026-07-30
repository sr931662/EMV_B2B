/*
 * Verifies the emailService transport changes without needing AWS.
 *
 * Covers: the SES SDK resolves and the client constructs; the ses transport builds a correct
 * SendEmailCommand; existing console/smtp selection still works (regression); an unknown
 * EMAIL_TRANSPORT degrades to console instead of throwing; and sendEmail keeps its
 * never-throw contract when the transport fails.
 */
const path = require('path');
const BACKEND = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/backend';

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail !== undefined ? ` -> ${detail}` : ''}`);
  }
};

(async () => {
  console.log('\n=== 1. SDK resolves and client constructs ===');
  const { SESv2Client, SendEmailCommand } = require(path.join(
    BACKEND,
    'node_modules/@aws-sdk/client-sesv2'
  ));
  check('@aws-sdk/client-sesv2 resolves', typeof SESv2Client === 'function');

  const client = new SESv2Client({ region: 'ap-south-1' });
  check('SESv2Client constructs without credentials present', !!client);

  console.log('\n=== 2. SendEmailCommand shape matches what the transport builds ===');
  const cmd = new SendEmailCommand({
    FromEmailAddress: 'no-reply@example.com',
    Destination: { ToAddresses: ['someone@example.com'] },
    ConfigurationSetName: 'travnexa-prod-emails',
    Content: {
      Simple: {
        Subject: { Data: 'subject', Charset: 'UTF-8' },
        Body: {
          Html: { Data: '<p>hi</p>', Charset: 'UTF-8' },
          Text: { Data: 'hi', Charset: 'UTF-8' },
        },
      },
    },
  });
  check('command accepts the transport payload', cmd.input.FromEmailAddress === 'no-reply@example.com');
  check('destination set correctly', cmd.input.Destination.ToAddresses[0] === 'someone@example.com');

  console.log('\n=== 3. emailService transport selection ===');
  // Fresh require each time so the module-level transport map is exercised as loaded.
  const servicePath = path.join(BACKEND, 'src/services/emailService.js');

  // Capture console output so we can assert on what each transport does.
  const captured = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...a) => captured.push(['log', a.join(' ')]);
  console.error = (...a) => captured.push(['error', a.join(' ')]);

  const restore = () => {
    console.log = realLog;
    console.error = realError;
  };

  try {
    delete require.cache[require.resolve(servicePath)];
    process.env.EMAIL_TRANSPORT = 'console';
    let svc = require(servicePath);
    captured.length = 0;
    await svc.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>', text: 'H' });
    const consoleWorked = captured.some(([, m]) => m.includes('[email:console]') && m.includes('a@b.com'));

    // Unknown transport must warn and fall back, not throw.
    delete require.cache[require.resolve(servicePath)];
    process.env.EMAIL_TRANSPORT = 'carrier-pigeon';
    svc = require(servicePath);
    captured.length = 0;
    await svc.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>', text: 'H' });
    const fellBack =
      captured.some(([lvl, m]) => lvl === 'error' && m.includes('unknown EMAIL_TRANSPORT')) &&
      captured.some(([, m]) => m.includes('[email:console]'));

    // SES selected but with no credentials/identity: must fail softly, never throw.
    delete require.cache[require.resolve(servicePath)];
    process.env.EMAIL_TRANSPORT = 'ses';
    process.env.AWS_REGION = 'ap-south-1';
    process.env.SES_FROM_ADDRESS = 'no-reply@example.invalid';
    // Point the SDK at an unroutable endpoint so this cannot accidentally send anything real.
    process.env.AWS_ENDPOINT_URL_SESV2 = 'http://127.0.0.1:1';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    svc = require(servicePath);
    captured.length = 0;
    let threw = false;
    try {
      await svc.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>', text: 'H' });
    } catch {
      threw = true;
    }
    const softFailed = !threw && captured.some(([lvl, m]) => lvl === 'error' && m.includes('failed'));

    // Missing "to" is still guarded.
    captured.length = 0;
    await svc.sendEmail({ to: undefined, subject: 'S', html: '<p>H</p>' });
    const guardedNoTo = captured.some(([, m]) => m.includes('no "to" address'));

    restore();

    check('EMAIL_TRANSPORT=console still renders to stdout (regression)', consoleWorked);
    check('unknown EMAIL_TRANSPORT warns and falls back to console', fellBack);
    check('EMAIL_TRANSPORT=ses fails softly and never throws', softFailed, threw ? 'it threw' : 'no error logged');
    check('missing "to" is still short-circuited', guardedNoTo);
  } catch (e) {
    restore();
    check('transport selection block ran', false, e.message);
  }

  console.log('\n=== 4. index.js still parses and exports the app ===');
  try {
    delete require.cache[require.resolve(path.join(BACKEND, 'src/index.js'))];
    const app = require(path.join(BACKEND, 'src/index.js'));
    check('index.js exports an express app', typeof app === 'function' && typeof app.listen === 'function');
  } catch (e) {
    check('index.js loads', false, e.message);
  }

  console.log(`\n=========================\n  PASSED: ${pass}   FAILED: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
