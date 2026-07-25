// Access policy for the data libraries (destinations, day templates, hotels), kept in one
// place so the three route files cannot drift apart.
//
// WRITE (create/edit/archive/restore): admin + data_feeder. The data_feeder intern role
//   exists precisely to maintain this library and has no access to anything else.
// READ: every role, partners included — they browse the library, and the package builder
//   (step 4) reads from it. Listed explicitly rather than relying on authMiddleware alone,
//   so a role added later does not silently inherit read access.
const CAN_WRITE_LIBRARY = ['admin', 'data_feeder'];
const CAN_READ_LIBRARY = ['admin', 'data_feeder', 'partner'];

// Packages (build step 4). Assembling a saleable package is an admin job: the data_feeder
// maintains the raw library, the admin decides what becomes a product and at what raw price.
//
// data_feeder is deliberately absent from BOTH lists — interns have no package access at all,
// not even read. Packages and the EMV quote PDF expose raw wholesale pricing, which the intern
// role has no business seeing. Their world stays library-only.
const CAN_WRITE_PACKAGES = ['admin'];
const CAN_READ_PACKAGES = ['admin', 'partner'];

// Quotes (build step 5). A quote is a partner's own commercial document, so only partners
// create and edit them. Admin gets read access for the CMS/back-office view (step 9) and to
// verify payments against a quote (step 6) — never write access.
//
// Role is only half the story: every single-quote operation additionally enforces
// partnerId === req.user.id, so one partner can never reach another's quote.
// data_feeder is absent entirely, consistent with having no package access.
const CAN_WRITE_QUOTES = ['partner'];
const CAN_READ_QUOTES = ['partner', 'admin'];

// Payments (build step 6). Partners submit proof; only an admin verifies it (locked rule 6).
// The whole /api/admin/* surface is admin-only — a partner cannot reach the verification queue
// at all, which is also how one partner is kept from seeing another's payments.
const CAN_SUBMIT_PAYMENT = ['partner'];
const CAN_VERIFY_PAYMENT = ['admin'];

// Visa services (build step 7).
//
// Country + required-document config: admin write, but read is open to every authenticated
// role — partners need the checklist to know what to upload, and unlike packages there is no
// pricing data here for data_feeder to be kept away from.
const CAN_WRITE_VISA_CONFIG = ['admin'];
const CAN_READ_VISA_CONFIG = ['admin', 'data_feeder', 'partner'];

// Visa requests: partner-only write (it's the partner's own application, like a quote), admin
// read for verification/back-office. Every single-request operation additionally enforces
// partnerId === req.user.id (see visaRequestService.getForUser) — role alone is not the
// isolation boundary, same pattern as quotes.
const CAN_WRITE_VISA_REQUESTS = ['partner'];
const CAN_READ_VISA_REQUESTS = ['partner', 'admin'];

// Partner dashboard (build step 9, module 3). Admin has its own dashboard —
// /api/admin/reports/summary — so this one stays partner-only rather than dual-purpose.
const CAN_ACCESS_DASHBOARD = ['partner'];

module.exports = {
  CAN_WRITE_LIBRARY,
  CAN_READ_LIBRARY,
  CAN_WRITE_PACKAGES,
  CAN_READ_PACKAGES,
  CAN_WRITE_QUOTES,
  CAN_READ_QUOTES,
  CAN_SUBMIT_PAYMENT,
  CAN_VERIFY_PAYMENT,
  CAN_WRITE_VISA_CONFIG,
  CAN_READ_VISA_CONFIG,
  CAN_WRITE_VISA_REQUESTS,
  CAN_READ_VISA_REQUESTS,
  CAN_ACCESS_DASHBOARD,
};
