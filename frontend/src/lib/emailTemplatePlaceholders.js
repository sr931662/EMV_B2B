// Mirrors the variables each seeded template actually uses (backend/prisma/seed.js + the
// services that call emailService.sendTemplatedEmail). Shown as a hint near the body editor —
// a template not in this map is presumably custom, so we fall back to the generic set.

export const KNOWN_TEMPLATE_PLACEHOLDERS = {
  partner_welcome_otp: ['companyName', 'otp'],
  partner_password_reset: ['email', 'otp'],
  package_payment_submitted: ['companyName', 'packageTitle', 'transactionId', 'amount', 'slaMessage'],
  package_payment_approved: ['companyName', 'packageTitle'],
  package_payment_rejected: ['companyName', 'packageTitle', 'remarks'],
  visa_request_submitted: [
    'companyName',
    'applicationNumber',
    'countryName',
    'passengerCount',
    'date',
    'status',
    'slaMessage',
  ],
  visa_payment_approved: ['companyName', 'applicationNumber', 'countryName'],
  visa_payment_rejected: ['companyName', 'applicationNumber', 'remarks'],
  visa_processing_started: ['companyName', 'applicationNumber', 'countryName'],
  visa_completed: ['companyName', 'applicationNumber', 'countryName'],
  visa_application_rejected: ['companyName', 'applicationNumber', 'remarks'],
  payment_info_requested: ['companyName', 'subject', 'remarks'],
  admin_new_package_order: [
    'companyName',
    'agencyEmail',
    'packageTitle',
    'destination',
    'leadName',
    'amount',
    'transactionId',
  ],
  admin_new_visa_request: [
    'companyName',
    'agencyEmail',
    'applicationNumber',
    'countryName',
    'passengerCount',
    'passengerNames',
    'uploadedDocs',
    'transactionId',
    'amount',
  ],
};

const GENERIC_PLACEHOLDERS = ['companyName', 'otp', 'amount', 'status', 'remarks'];

export function placeholdersFor(name) {
  return KNOWN_TEMPLATE_PLACEHOLDERS[name] ?? GENERIC_PLACEHOLDERS;
}
