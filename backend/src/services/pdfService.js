const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Generated artefacts live outside src/ and outside git (see .gitignore).
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const EMV_QUOTE_DIR_REL = path.join('storage', 'quotes', 'emv');

const BRAND = 'TravNexa Global';
const TAGLINE = 'Empowering Travel Businesses Worldwide';

// Palette kept deliberately small: near-black body, one accent, one muted grey.
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const ACCENT = '#0f5c7a';
const RULE = '#d1d5db';
const PANEL = '#f3f4f6';

/** Absolute path for a stored relative path (we persist relative paths, never absolute). */
function resolveStoragePath(relativePath) {
  return path.join(BACKEND_ROOT, relativePath);
}

/**
 * Amounts are rendered as "INR 1,23,456.00" rather than with the ₹ symbol on purpose:
 * pdfkit's built-in Helvetica uses WinAnsi encoding, which has no glyph for U+20B9, so a
 * rupee sign would silently come out as garbage. Embedding a Unicode font would fix it and
 * is the right move once there is a real brand font to embed.
 */
function formatInr(amount) {
  const n = Number(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

  return `INR ${formatted}`;
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function bottomLimit(doc) {
  return doc.page.height - doc.page.margins.bottom;
}

/** Start a new page if `needed` vertical points are not available. */
function ensureSpace(doc, needed) {
  if (doc.y + needed > bottomLimit(doc)) doc.addPage();
}

function horizontalRule(doc, color = RULE) {
  const y = doc.y;
  doc
    .save()
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.75)
    .strokeColor(color)
    .stroke()
    .restore();
  doc.y = y + 1;
}

function sectionHeading(doc, label) {
  ensureSpace(doc, 60);
  doc.moveDown(1.1);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(label.toUpperCase(), {
    characterSpacing: 0.8,
  });
  doc.moveDown(0.35);
  horizontalRule(doc);
  doc.moveDown(0.5);
}

/**
 * inclusions/exclusions are free text. If the author used line breaks we treat each line as
 * a bullet; otherwise it renders as a single paragraph.
 */
function renderTextBlock(doc, raw) {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);

  doc.font('Helvetica').fontSize(10).fillColor(INK);

  if (lines.length <= 1) {
    doc.text(lines[0] ?? '—', { width: contentWidth(doc), align: 'left', lineGap: 2 });
    return;
  }

  lines.forEach((line) => {
    ensureSpace(doc, 24);
    const startY = doc.y;
    doc.fillColor(ACCENT).text('•', doc.page.margins.left, startY, { continued: false });
    doc
      .fillColor(INK)
      .text(line, doc.page.margins.left + 14, startY, {
        width: contentWidth(doc) - 14,
        lineGap: 2,
      });
    doc.moveDown(0.15);
  });
}

function renderHeader(doc, pkg) {
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(BRAND);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(TAGLINE);
  doc.moveDown(0.6);
  horizontalRule(doc, ACCENT);
  doc.moveDown(0.9);

  // Document label + generated date on one line
  const labelY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT).text('PACKAGE QUOTATION', doc.page.margins.left, labelY, {
    characterSpacing: 1,
  });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      doc.page.margins.left,
      labelY,
      { width: contentWidth(doc), align: 'right' }
    );

  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text(pkg.title, { lineGap: 1 });
  doc.moveDown(0.35);

  const nights = pkg.nights === 1 ? '1 night' : `${pkg.nights} nights`;
  const days = pkg.days === 1 ? '1 day' : `${pkg.days} days`;
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(MUTED)
    .text(`${pkg.destination?.name ?? 'Destination'}   ·   ${days} / ${nights}`);

  if (Array.isArray(pkg.tags) && pkg.tags.length) {
    doc.moveDown(0.25);
    doc.fontSize(9).fillColor(ACCENT).text(pkg.tags.join('   ·   '));
  }
}

/** Price panel. RAW EMV price only — locked rule 4(a): the EMV quote never carries markup. */
function renderPricePanel(doc, pkg) {
  doc.moveDown(1);
  ensureSpace(doc, 78);

  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const top = doc.y;
  const h = 62;

  doc.save().roundedRect(x, top, w, h, 4).fillColor(PANEL).fill().restore();
  doc
    .save()
    .moveTo(x, top)
    .lineTo(x, top + h)
    .lineWidth(3)
    .strokeColor(ACCENT)
    .stroke()
    .restore();

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('PACKAGE PRICE', x + 16, top + 12, { characterSpacing: 0.8 });
  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(INK)
    .text(formatInr(pkg.rawPrice), x + 16, top + 25);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text('Wholesale rate, per package. Taxes as applicable.', x + 16, top + 48);

  doc.y = top + h;
  doc.x = x;
}

function renderItinerary(doc, pkg) {
  sectionHeading(doc, 'Day-by-day itinerary');

  const days = [...(pkg.packageDays ?? [])].sort((a, b) => a.dayNumber - b.dayNumber);

  if (!days.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text('Itinerary to be confirmed.');
    return;
  }

  days.forEach((day, i) => {
    ensureSpace(doc, 70);
    if (i > 0) doc.moveDown(0.6);

    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(ACCENT)
      .text(`Day ${day.dayNumber}`, { continued: true })
      .fillColor(INK)
      .text(`   ${day.title}`);

    doc.moveDown(0.2);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(day.description, { width: contentWidth(doc), lineGap: 2.5, align: 'left' });
  });
}

function renderHotels(doc, pkg) {
  sectionHeading(doc, 'Hotels');

  // Sorted here rather than trusting the caller's ordering, exactly as the itinerary is —
  // sortOrder is the admin's deliberate selection order (0-based).
  const hotels = [...(pkg.packageHotels ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );

  if (!hotels.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text('Hotels to be confirmed.');
    return;
  }

  hotels.forEach((hotel, i) => {
    ensureSpace(doc, 62);
    if (i > 0) doc.moveDown(0.55);

    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(INK)
      .text(hotel.hotelName, { continued: true })
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`   ${hotel.hotelCategory}`);

    doc.moveDown(0.2);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(hotel.hotelDescription, { width: contentWidth(doc), lineGap: 2.5 });
  });
}

/**
 * Footer on every page.
 *
 * `label` is passed in rather than hardcoded because the same renderer serves both the
 * EMV-branded documents and the partner's white-labelled quote, where no EMV string of any
 * kind may appear (locked rule 4(b)).
 */
function renderFooters(doc, label) {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    const bottomMargin = doc.page.margins.bottom;
    const y = doc.page.height - bottomMargin + 14;
    const x = doc.page.margins.left;
    const w = contentWidth(doc);

    // The footer sits inside the bottom margin. pdfkit adds a fresh page as soon as text is
    // written past the bottom margin, so zero it for the duration of the stamp — otherwise
    // every page gains a blank follower.
    doc.page.margins.bottom = 0;

    doc
      .save()
      .moveTo(x, y - 6)
      .lineTo(x + w, y - 6)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke()
      .restore();

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, x, y, {
      width: w,
      align: 'left',
      lineBreak: false,
    });

    doc.text(`Page ${i - range.start + 1} of ${range.count}`, x, y, {
      width: w,
      align: 'right',
      lineBreak: false,
    });

    doc.page.margins.bottom = bottomMargin;
  }
}

/**
 * Builds the fixed EMV-branded quote for a package and writes it to storage.
 *
 * Takes a package already loaded with `destination`, `packageDays` and `packageHotels` —
 * the same payload the itinerary page renders, so the PDF and the page cannot disagree
 * (locked rule 4(a): "fixed content sourced from the itinerary page").
 *
 * Returns the path RELATIVE to the backend root, which is what we persist.
 *
 * @param {object} pkg  package + destination + packageDays + packageHotels
 * @param {object} [opts]
 * @param {boolean} [opts.compress=true]  set false to emit uncompressed streams (test asserts)
 * @param {string}  [opts.fileName]       override the output filename (tests)
 */
async function generateEmvQuotePdf(pkg, { compress = true, fileName } = {}) {
  const dirAbs = path.join(BACKEND_ROOT, EMV_QUOTE_DIR_REL);
  fs.mkdirSync(dirAbs, { recursive: true });

  // Deterministic filename: regenerating a package's quote overwrites in place rather than
  // leaving orphaned PDFs behind on every edit.
  const name = fileName ?? `emv-quote-${pkg.id}.pdf`;
  const relativePath = path.join(EMV_QUOTE_DIR_REL, name);
  const absolutePath = path.join(BACKEND_ROOT, relativePath);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true, // needed to stamp footers once the page count is known
    compress,
    info: {
      Title: `TravNexa Quote — ${pkg.title}`,
      Author: BRAND,
      Subject: `Wholesale package quotation for ${pkg.destination?.name ?? 'destination'}`,
    },
  });

  const stream = fs.createWriteStream(absolutePath);
  doc.pipe(stream);

  renderHeader(doc, pkg);
  renderPricePanel(doc, pkg);

  sectionHeading(doc, 'Inclusions');
  renderTextBlock(doc, pkg.inclusions);

  sectionHeading(doc, 'Exclusions');
  renderTextBlock(doc, pkg.exclusions);

  renderItinerary(doc, pkg);
  renderHotels(doc, pkg);
  renderFooters(doc, `${BRAND}  ·  Trade document — not for onward distribution to end customers.`);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Store with forward slashes so the value is portable across platforms.
  return relativePath.split(path.sep).join('/');
}

// ===========================================================================
// Partner white-label quote (locked rules 3, 4b, 5)
// ===========================================================================

const PARTNER_QUOTE_DIR_REL = path.join('storage', 'quotes', 'partner');

/**
 * Partner-branded header, sourced ENTIRELY from PartnerProfile. Nothing in here may reference
 * EMV in any form — the end customer must believe the agency produced this document.
 */
function renderPartnerHeader(doc, profile) {
  const logo = embeddableLogoPath(profile.companyLogo);

  if (logo) {
    try {
      doc.image(logo, doc.page.margins.left, doc.y, { fit: [150, 48] });
      doc.y += 54;
    } catch {
      // Unreadable/corrupt image — fall back to the wordmark rather than failing the quote.
      doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(profile.companyName);
    }
  } else {
    // Text fallback when no logo is on file.
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(profile.companyName);
  }

  const addressLine = [profile.officeAddress, profile.city, profile.state, profile.pincode, profile.country]
    .filter(Boolean)
    .join(', ');
  const contactLine = [profile.mobile, profile.businessEmail, profile.website].filter(Boolean).join('   ·   ');

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  if (addressLine) doc.text(addressLine, { width: contentWidth(doc) });
  if (contactLine) doc.text(contactLine, { width: contentWidth(doc) });

  doc.moveDown(0.6);
  horizontalRule(doc, ACCENT);
  doc.moveDown(0.9);
}

/**
 * Only embeds logos that resolve to a real local file inside the backend's storage directory.
 *
 * companyLogo is partner-supplied. Fetching an arbitrary URL from it server-side would be an
 * SSRF vector (internal endpoints, cloud metadata), so remote values are never dereferenced —
 * they degrade to the text wordmark until an upload pipeline stores the file locally.
 */
function embeddableLogoPath(companyLogo) {
  if (!companyLogo || typeof companyLogo !== 'string') return null;
  if (/^https?:\/\//i.test(companyLogo)) return null;

  const storageRoot = path.join(BACKEND_ROOT, 'storage');
  const candidate = path.resolve(BACKEND_ROOT, companyLogo);

  // Path-traversal guard: must stay under storage/.
  if (!candidate.startsWith(storageRoot + path.sep)) return null;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  if (!/\.(png|jpe?g)$/i.test(candidate)) return null;

  return candidate;
}

function renderQuoteMeta(doc, quote, pkg) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT).text('QUOTATION', { characterSpacing: 1 });
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text(pkg.title, { lineGap: 1 });
  doc.moveDown(0.3);

  const nights = pkg.nights === 1 ? '1 night' : `${pkg.nights} nights`;
  const days = pkg.days === 1 ? '1 day' : `${pkg.days} days`;
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(MUTED)
    .text(`${pkg.destination?.name ?? ''}   ·   ${days} / ${nights}`);

  doc.moveDown(0.8);

  const pax = [
    `${quote.adults} adult${quote.adults === 1 ? '' : 's'}`,
    quote.children ? `${quote.children} child${quote.children === 1 ? '' : 'ren'}` : null,
    quote.infants ? `${quote.infants} infant${quote.infants === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const travel = new Date(quote.travelDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`Prepared for: ${quote.leadName}`);
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(`Travel date: ${travel}   ·   ${pax}`);
}

/**
 * The single number the customer pays.
 *
 * Renders quote.sellingPrice and nothing else — the package's raw wholesale price and the
 * partner's markup are never printed, never itemised, never totalled (locked rules 4b, 5).
 */
function renderSellingPricePanel(doc, quote) {
  doc.moveDown(1);
  ensureSpace(doc, 78);

  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const top = doc.y;
  const h = 62;

  doc.save().roundedRect(x, top, w, h, 4).fillColor(PANEL).fill().restore();
  doc
    .save()
    .moveTo(x, top)
    .lineTo(x, top + h)
    .lineWidth(3)
    .strokeColor(ACCENT)
    .stroke()
    .restore();

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('TOTAL PACKAGE PRICE', x + 16, top + 12, { characterSpacing: 0.8 });
  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(INK)
    .text(formatInr(quote.sellingPrice), x + 16, top + 25);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text('Total for the party above. Taxes as applicable.', x + 16, top + 48);

  doc.y = top + h;
  doc.x = x;
}

function slugify(value, fallback = 'quote') {
  return (
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || fallback
  );
}

/**
 * Builds the partner's customer-facing quote PDF.
 *
 * Two branding modes (locked rule 4b):
 *   OWN — every brand element comes from PartnerProfile. No EMV string appears anywhere in the
 *         document, including the PDF metadata dictionary and the suggested filename.
 *   EMV — EMV-branded styling, chosen by the partner as a presentation option.
 *
 * In BOTH modes the price shown is quote.sellingPrice (raw + markup). The raw price and the
 * markup are never shown in either mode: this is the partner's document for their customer,
 * and the customer sees one number.
 *
 * @param {object} quote           the Quote row (sellingPrice, lead details, branding)
 * @param {object} pkg             package + destination + packageDays + packageHotels
 * @param {object} partnerProfile  PartnerProfile of the owning partner
 * @param {object} [opts]
 * @param {boolean} [opts.compress=true]
 * @param {string}  [opts.fileName]
 */
async function generateQuotePdf(quote, pkg, partnerProfile, { compress = true, fileName } = {}) {
  const dirAbs = path.join(BACKEND_ROOT, PARTNER_QUOTE_DIR_REL);
  fs.mkdirSync(dirAbs, { recursive: true });

  const own = quote.branding === 'OWN';

  const name = fileName ?? `quote-${quote.id}.pdf`;
  const relativePath = path.join(PARTNER_QUOTE_DIR_REL, name);
  const absolutePath = path.join(BACKEND_ROOT, relativePath);

  // Metadata is part of the document. In OWN mode it must be as clean as the visible page —
  // a curious customer opening File > Properties must not find EMV there.
  const info = own
    ? {
        Title: `Quote — ${pkg.title}`,
        Author: partnerProfile.companyName,
        Subject: `Holiday quotation prepared for ${quote.leadName}`,
      }
    : {
        Title: `Quote — ${pkg.title}`,
        Author: BRAND,
        Subject: `Holiday quotation prepared for ${quote.leadName}`,
      };

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true,
    compress,
    info,
  });

  const stream = fs.createWriteStream(absolutePath);
  doc.pipe(stream);

  if (own) {
    renderPartnerHeader(doc, partnerProfile);
  } else {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(BRAND);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(TAGLINE);
    doc.moveDown(0.6);
    horizontalRule(doc, ACCENT);
    doc.moveDown(0.9);
  }

  renderQuoteMeta(doc, quote, pkg);
  renderSellingPricePanel(doc, quote);

  sectionHeading(doc, 'Inclusions');
  renderTextBlock(doc, pkg.inclusions);

  sectionHeading(doc, 'Exclusions');
  renderTextBlock(doc, pkg.exclusions);

  renderItinerary(doc, pkg);
  renderHotels(doc, pkg);

  if (quote.specialRequests) {
    sectionHeading(doc, 'Special requests');
    renderTextBlock(doc, quote.specialRequests);
  }

  const footer = own
    ? [partnerProfile.companyName, partnerProfile.mobile, partnerProfile.businessEmail]
        .filter(Boolean)
        .join('  ·  ')
    : `${BRAND}  ·  ${TAGLINE}`;

  renderFooters(doc, footer);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return relativePath.split(path.sep).join('/');
}

/** Filename suggested to the customer. In OWN mode it carries partner branding only. */
function quotePdfDownloadName(quote, pkg, partnerProfile) {
  const lead = slugify(quote.leadName, 'customer');

  return quote.branding === 'OWN'
    ? `quote-${slugify(partnerProfile?.companyName, 'agency')}-${lead}.pdf`
    : `quote-${slugify(pkg?.title, 'package')}-${lead}.pdf`;
}

module.exports = {
  generateEmvQuotePdf,
  generateQuotePdf,
  quotePdfDownloadName,
  resolveStoragePath,
  formatInr,
  EMV_QUOTE_DIR_REL,
  PARTNER_QUOTE_DIR_REL,
};
