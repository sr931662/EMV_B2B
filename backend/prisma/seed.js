require('dotenv').config();

const prisma = require('../src/utils/prisma');
const authService = require('../src/services/authService');

const ADMIN_EMAIL = 'admin@emv.com';
const ADMIN_PASSWORD = 'Admin@123';

// Build step 8: email content lives in EmailTemplate rows, not hardcoded strings, so an admin
// can edit wording later via the CMS (step 9) without a code change. {{placeholder}} syntax is
// interpolated by emailService.renderTemplate. Every event that fires an email in
// authService/paymentService/visaRequestService looks up one of these by name — see
// PROJECT_SPEC.md for the full event -> template -> notification mapping.
const EMAIL_TEMPLATES = [
  {
    name: 'partner_welcome_otp',
    subject: 'Verify your Ease My Vacations partner account',
    body: `<p>Hello {{companyName}},</p>
<p>Thanks for registering with Ease My Vacations. Use the code below to verify your account:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{otp}}</p>
<p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  },
  {
    name: 'partner_password_reset',
    subject: 'Reset your Ease My Vacations password',
    body: `<p>Hello,</p>
<p>We received a request to reset the password for {{email}}. Use the code below to continue:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{otp}}</p>
<p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  },
  {
    name: 'package_payment_submitted',
    subject: 'Payment received — {{packageTitle}}',
    body: `<p>Hello {{companyName}},</p>
<p>We've received your payment submission for <strong>{{packageTitle}}</strong> (transaction {{transactionId}}, amount {{amount}}).</p>
<p>{{slaMessage}}</p>`,
  },
  {
    name: 'package_payment_approved',
    subject: 'Booking confirmed — {{packageTitle}}',
    body: `<p>Hello {{companyName}},</p>
<p>Good news — your payment for <strong>{{packageTitle}}</strong> has been verified and the booking is now <strong>confirmed</strong>.</p>`,
  },
  {
    name: 'package_payment_rejected',
    subject: 'Action needed — payment issue for {{packageTitle}}',
    body: `<p>Hello {{companyName}},</p>
<p>We were unable to verify your payment for <strong>{{packageTitle}}</strong>.</p>
<p>Reason: {{remarks}}</p>
<p>Please review and submit a corrected payment when you're ready.</p>`,
  },
  {
    name: 'visa_request_submitted',
    subject: 'Visa payment received — {{applicationNumber}}',
    body: `<p>Hello {{companyName}},</p>
<p>We've received your payment submission for visa application <strong>{{applicationNumber}}</strong> ({{countryName}}, {{passengerCount}} passenger(s)) on {{date}}.</p>
<p>Status: {{status}}</p>
<p>{{slaMessage}}</p>`,
  },
  {
    name: 'visa_payment_approved',
    subject: 'Visa payment approved — {{applicationNumber}}',
    body: `<p>Hello {{companyName}},</p>
<p>Your payment for visa application <strong>{{applicationNumber}}</strong> ({{countryName}}) has been verified and approved.</p>`,
  },
  {
    name: 'visa_payment_rejected',
    subject: 'Action needed — visa payment issue for {{applicationNumber}}',
    body: `<p>Hello {{companyName}},</p>
<p>We were unable to verify your payment for visa application <strong>{{applicationNumber}}</strong>.</p>
<p>Reason: {{remarks}}</p>
<p>Please review and submit a corrected payment when you're ready.</p>`,
  },
  {
    name: 'visa_processing_started',
    subject: 'Visa processing has started — {{applicationNumber}}',
    body: `<p>Hello {{companyName}},</p>
<p>Processing has now started for visa application <strong>{{applicationNumber}}</strong> ({{countryName}}). We'll notify you as soon as it's complete.</p>`,
  },
  {
    name: 'visa_completed',
    subject: 'Visa completed — {{applicationNumber}}',
    body: `<p>Hello {{companyName}},</p>
<p>Visa application <strong>{{applicationNumber}}</strong> ({{countryName}}) has been completed.</p>`,
  },
  {
    name: 'admin_new_package_order',
    subject: 'New package payment submitted — {{packageTitle}} ({{companyName}})',
    body: `<p>New package payment submitted.</p>
<ul>
<li>Agency: {{companyName}} ({{agencyEmail}})</li>
<li>Package: {{packageTitle}} — {{destination}}</li>
<li>Lead: {{leadName}}</li>
<li>Amount: {{amount}}</li>
<li>Transaction ID: {{transactionId}}</li>
</ul>
<p>Review in the admin payment queue.</p>`,
  },
  {
    name: 'admin_new_visa_request',
    subject: 'New visa payment submitted — {{applicationNumber}} ({{companyName}})',
    body: `<p>New visa payment submitted.</p>
<ul>
<li>Agency: {{companyName}} ({{agencyEmail}})</li>
<li>Application: {{applicationNumber}} — {{countryName}}</li>
<li>Passengers ({{passengerCount}}): {{passengerNames}}</li>
<li>Uploaded documents: {{uploadedDocs}}</li>
<li>Transaction ID: {{transactionId}}</li>
<li>Amount: {{amount}}</li>
</ul>
<p>Review in the admin payment queue.</p>`,
  },
  {
    // Step-9 carried-over fix: previously this event (paymentService.requestInfo, both
    // PACKAGE and VISA) fired only an in-app notification because no template covered it.
    name: 'payment_info_requested',
    subject: 'Action needed — more information required for {{subject}}',
    body: `<p>Hello {{companyName}},</p>
<p>We need a bit more information about your payment for <strong>{{subject}}</strong>.</p>
<p>{{remarks}}</p>
<p>Please review and resubmit your payment proof when you're ready.</p>`,
  },
  {
    // Step-9 carried-over fix: visaRequestService.rejectApplication (POST
    // /api/admin/visa-requests/:id/reject-application) kills the WHOLE application, not one
    // payment. The brief described this as "visa_payment_rejected-style", but that template's
    // wording ("please review and submit a corrected payment") is wrong here — there is
    // nothing left to resubmit once the application itself is rejected — so this is a distinct
    // template with correct wording rather than a literal reuse.
    name: 'visa_application_rejected',
    subject: 'Visa application rejected — {{applicationNumber}}',
    body: `<p>Hello {{companyName}},</p>
<p>Your visa application <strong>{{applicationNumber}}</strong> has been rejected.</p>
<p>Reason: {{remarks}}</p>
<p>Please contact Ease My Vacations if you have questions, or submit a new application if you'd like to try again.</p>`,
  },
];

// Idempotent by name, and deliberately create-only (never update): re-running the seed after
// an admin has hand-edited a template's wording via the future CMS must NOT clobber it back to
// the default. Only "this name exists" is guaranteed, never its content once a row exists.
async function seedEmailTemplates() {
  for (const t of EMAIL_TEMPLATES) {
    const existing = await prisma.emailTemplate.findUnique({ where: { name: t.name } });
    if (existing) continue;

    await prisma.emailTemplate.create({ data: t });
    console.log(`[seed] created email template "${t.name}"`);
  }
}

// Idempotent: creates the bootstrap admin only when no admin exists at all, so re-running
// the seed never clobbers a real admin's password. Archived admins do not count — if the
// only admin has been archived we still need a way back in.
async function seedAdmin() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin', archived: false },
    select: { id: true, email: true },
  });

  if (existingAdmin) {
    console.log(`[seed] admin already exists (${existingAdmin.email}) — nothing to do.`);
    return;
  }

  const admin = await authService.createStaffUser(
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    'admin'
  );

  console.log(`[seed] created admin ${admin.email} (id=${admin.id})`);
  console.log(`[seed] password: ${ADMIN_PASSWORD} — change it after first login.`);
}

// Both steps are independent and both idempotent — neither should short-circuit the other.
async function main() {
  await seedAdmin();
  await seedEmailTemplates();
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
