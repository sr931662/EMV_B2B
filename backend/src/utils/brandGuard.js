// Guard against EMV branding leaking into partner white-label quotes (locked rule 4b).
//
// A partner-branded PDF reproduces the package title and destination name verbatim. Those
// strings are authored by EMV staff, so a package called "EMV Deluxe" would put the
// wholesaler's name straight into a document the end customer is meant to believe came from
// their agency — defeating the white-label guarantee no matter how careful the PDF renderer is.
// The only reliable place to stop it is at the point the text is authored.
const EMV_BRAND_PATTERN = /emv|ease\s*my\s*vacations/i;

const brandGuardMessage = (subject) =>
  `${subject} cannot contain EMV branding — it would leak into partner white-label quotes.`;

/** Attach to any zod string schema whose value ends up rendered in a partner-branded PDF. */
const withBrandGuard = (schema, subject) =>
  schema.refine((value) => !EMV_BRAND_PATTERN.test(value), {
    error: brandGuardMessage(subject),
  });

module.exports = { EMV_BRAND_PATTERN, brandGuardMessage, withBrandGuard };
