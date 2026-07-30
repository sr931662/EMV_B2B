// Guard against the wholesaler's branding leaking into partner white-label quotes (locked rule 4b).
//
// A partner-branded PDF reproduces the package title and destination name verbatim. Those
// strings are authored by wholesaler staff, so a package called "EMV Deluxe" (or "TravNexa
// Deluxe") would put the wholesaler's name straight into a document the end customer is meant
// to believe came from their agency — defeating the white-label guarantee no matter how careful
// the PDF renderer is. The only reliable place to stop it is at the point the text is authored.
//
// Matches both the legacy internal name ("EMV" / "Ease My Vacations") and the current display
// name ("TravNexa") — the enum value and DB rows still say "EMV" (see DATA_MODELS.md), so both
// must stay blocked regardless of which one is the current public-facing name.
const EMV_BRAND_PATTERN = /emv|ease\s*my\s*vacations|travnexa/i;

const brandGuardMessage = (subject) =>
  `${subject} cannot contain wholesaler branding (EMV/TravNexa) — it would leak into partner white-label quotes.`;

/** Attach to any zod string schema whose value ends up rendered in a partner-branded PDF. */
const withBrandGuard = (schema, subject) =>
  schema.refine((value) => !EMV_BRAND_PATTERN.test(value), {
    error: brandGuardMessage(subject),
  });

module.exports = { EMV_BRAND_PATTERN, brandGuardMessage, withBrandGuard };
