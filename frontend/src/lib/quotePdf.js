import { slugify } from './format';

/** Mirrors backend/src/services/pdfService.js's quotePdfDownloadName exactly (see lib/format.js
 * for why the filename is computed client-side instead of read from Content-Disposition). */
export function quotePdfFilename(quote) {
  const lead = slugify(quote.leadName, 'customer');
  return quote.branding === 'OWN'
    ? `quote-${slugify(quote.partner?.partnerProfile?.companyName, 'agency')}-${lead}.pdf`
    : `quote-${slugify(quote.package?.title, 'package')}-${lead}.pdf`;
}
