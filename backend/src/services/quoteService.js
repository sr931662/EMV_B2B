const fs = require('fs');
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { generateQuotePdf, resolveStoragePath } = require('./pdfService');
const notificationService = require('./notificationService');
const settingsService = require('./settingsService');
const afterCommit = require('../utils/afterCommit');

// Statuses in which a quote is still the partner's to edit. Once it moves toward booking the
// commercial terms are fixed — a customer has said yes and money is in flight.
const EDITABLE_STATUSES = ['QUOTE_GENERATED'];

// Statuses where the quote has become a financial record and must stay visible.
const NON_ARCHIVABLE_STATUSES = ['BOOKING_CONFIRMED', 'ORDER_COMPLETED'];

const PACKAGE_FOR_QUOTE = {
  include: {
    destination: { select: { id: true, name: true, archived: true } },
    packageDays: { where: { archived: false }, orderBy: { dayNumber: 'asc' } },
    packageHotels: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
  },
};

const QUOTE_DETAIL_INCLUDE = {
  package: {
    select: {
      id: true,
      title: true,
      days: true,
      nights: true,
      rawPrice: true,
      inclusions: true,
      exclusions: true,
      gallery: true,
      tags: true,
      archived: true,
      packageDays: { where: { archived: false }, orderBy: { dayNumber: 'asc' } },
      packageHotels: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
      destination: {
        select: {
          id: true,
          name: true,
          archived: true,
          aboutDestination: true,
          packages: true,
          faqs: true,
        },
      },
    },
  },
  partner: {
    select: {
      id: true,
      email: true,
      partnerProfile: { select: { id: true, companyName: true } },
    },
  },
};

// Metadata only — screenshotPath is deliberately excluded. The proof image/PDF stays admin-only
// (streamed via GET /api/admin/payments/:id/screenshot); a partner gets the outcome and remarks,
// never the raw file path.
const PAYMENT_SUMMARY_SELECT = {
  id: true,
  status: true,
  amount: true,
  transactionId: true,
  adminRemarks: true,
  reconciliationMismatch: true,
  createdAt: true,
  verifiedAt: true,
};

// Used only by the single-quote detail fetch (getById) — list/create/update/confirm don't need
// the extra join. The payment is scoped to `where: { id }` on the already tenancy-checked quote,
// so this can never surface a payment belonging to someone else's quote.
const QUOTE_DETAIL_WITH_PAYMENT_INCLUDE = {
  ...QUOTE_DETAIL_INCLUDE,
  payments: {
    where: { archived: false },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: PAYMENT_SUMMARY_SELECT,
  },
};

/**
 * Fetches a quote and enforces tenancy.
 *
 * "Not found" and "not yours" deliberately return the SAME 404 with the same message: a 403 on
 * someone else's quote would confirm that the id exists, which is itself a leak across partners.
 */
async function getForUser(id, user, { include = QUOTE_DETAIL_INCLUDE } = {}) {
  const quote = await prisma.quote.findUnique({ where: { id }, include });

  const denied = !quote || (user.role !== 'admin' && quote.partnerId !== user.id);
  if (denied) throw ApiError.notFound(`No quote exists with id ${id}`);

  return quote;
}

/**
 * selling price = raw EMV price + partner markup (locked rule 5).
 *
 * `rawPrice` here is always the quote's OWN `rawPriceAtQuote` snapshot, never the live
 * Package.rawPrice — see freezeRawPrice below.
 *
 * Uses Prisma.Decimal, not JS floats: 100000.10 + 15000.20 in binary floating point is not
 * reliably 115000.30, and this value is what a customer is invoiced.
 */
function computeSellingPrice(rawPrice, markupAmount) {
  return new Prisma.Decimal(rawPrice).plus(new Prisma.Decimal(markupAmount));
}

/**
 * Has the package been repriced since this quote froze its wholesale basis?
 *
 * INFORMATIONAL ONLY. Nothing computes from this — it exists so the UI can tell an admin or
 * partner "the underlying package now costs something different", without any number on the
 * quote moving. All maths uses quote.rawPriceAtQuote.
 */
function rawPriceDrifted(quote, livePackageRawPrice) {
  return !new Prisma.Decimal(quote.rawPriceAtQuote).equals(new Prisma.Decimal(livePackageRawPrice));
}

async function loadSellablePackage(packageId) {
  const pkg = await prisma.package.findUnique({ where: { id: packageId }, ...PACKAGE_FOR_QUOTE });

  if (!pkg) throw ApiError.badRequest(`No package exists with id ${packageId}`);
  if (pkg.archived) {
    throw ApiError.badRequest(`Package "${pkg.title}" is archived and cannot be quoted`);
  }
  if (pkg.destination.archived) {
    throw ApiError.badRequest(
      `Package "${pkg.title}" belongs to archived destination "${pkg.destination.name}" and cannot be quoted`
    );
  }

  return pkg;
}

async function loadPartnerProfile(partnerId) {
  const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });

  if (!profile) {
    // A partner-role user without a profile cannot be white-labelled — there is no branding
    // to put on the document. Registration creates both in one transaction, so this is a
    // data-integrity failure rather than ordinary user error.
    throw ApiError.badRequest(
      'Your partner profile is missing. Contact TravNexa support before generating quotes.'
    );
  }

  return profile;
}

/**
 * (Re)generates the partner quote PDF and stores its path.
 *
 * Runs after the DB write commits — filesystem work cannot join a transaction. If it fails, the
 * quote still exists with a null pdfPath and the download route regenerates on demand, so the
 * PDF is never permanently missing (locked rule 3: always available).
 */
async function refreshQuotePdf(quoteId) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  const pkg = await prisma.package.findUnique({ where: { id: quote.packageId }, ...PACKAGE_FOR_QUOTE });
  const profile = await loadPartnerProfile(quote.partnerId);

  const relativePath = await generateQuotePdf(quote, pkg, profile);

  await prisma.quote.update({ where: { id: quoteId }, data: { pdfPath: relativePath } });

  return relativePath;
}

/**
 * "TRIP-<YYMMDD>-<random>" — short enough to read over the phone, unique enough in practice.
 * Same shape and reasoning as visaRequestService.generateApplicationNumber.
 */
function generateQuoteNumber() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();

  return `TRIP-${stamp}-${rand}`;
}

async function create(data, user) {
  const { packageId, markupAmount, branding, ...lead } = data;

  const pkg = await loadSellablePackage(packageId);
  await loadPartnerProfile(user.id); // fail before writing if branding data is missing

  // Freeze the wholesale basis at this instant. From here on the quote's economics are
  // independent of the package: repricing it later cannot move this quote's numbers.
  const rawPriceAtQuote = new Prisma.Decimal(pkg.rawPrice);
  const sellingPrice = computeSellingPrice(rawPriceAtQuote, markupAmount);

  // The TCS rate is frozen alongside the price for the same reason: a customer holding an invoice
  // must not have it re-taxed when policy changes. Reading the live setting here is the last time
  // this quote ever looks at it.
  const tcsRate = await settingsService.getTcsRate();
  const tcsAmount = settingsService.computeTcs(sellingPrice, tcsRate);

  const created = await prisma.quote.create({
    data: {
      packageId,
      partnerId: user.id, // from the token, never from the body
      ...lead,
      quoteNumber: generateQuoteNumber(),
      rawPriceAtQuote,
      markupAmount,
      sellingPrice,
      tcsRate,
      tcsAmount,
      branding,
      status: 'QUOTE_GENERATED',
    },
  });

  await refreshQuotePdf(created.id);

  // Step-9 carried-over fix: fire once the PDF is actually ready, not merely once the row
  // exists, so the notification's "ready to download" claim is true at the moment it's sent.
  await afterCommit(
    () =>
      notificationService.createNotification(
        user.id,
        'QUOTE_READY',
        `Your quote for "${pkg.title}" is ready to download.`
      ),
    { label: 'quote ready notification' }
  );

  return getForUser(created.id, user);
}

async function list(filters, user) {
  const { partnerId, status, includeArchived = false } = filters;

  const where = {};
  if (!includeArchived) where.archived = false;
  if (status) where.status = status;

  if (user.role === 'admin') {
    // ?partnerId= is an admin-only filter; a partner's scope is always themselves.
    if (partnerId) where.partnerId = partnerId;
  } else {
    where.partnerId = user.id;
  }

  return prisma.quote.findMany({
    where,
    include: QUOTE_DETAIL_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Single-quote detail fetch — the one place `latestPayment` is attached, so a partner can tell a
 * rejected-payment quote (reverted to CUSTOMER_APPROVED) apart from one that was never paid, and
 * see the admin's remarks without needing the notifications feed.
 */
async function getById(id, user) {
  const quote = await getForUser(id, user, { include: QUOTE_DETAIL_WITH_PAYMENT_INCLUDE });
  const { payments, ...rest } = quote;

  return { ...rest, latestPayment: payments[0] ?? null };
}

/**
 * Edits lead details / markup / branding. Allowed only while the quote is still
 * QUOTE_GENERATED: past that a customer has approved it and payment is in flight, so the
 * commercial terms must not shift underneath.
 */
async function update(id, data, user) {
  const existing = await getForUser(id, user);

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict(
      `Quote locked, already in booking flow (status: ${existing.status}). Only ${EDITABLE_STATUSES.join(
        '/'
      )} quotes can be edited.`
    );
  }

  const updateData = { ...data };

  // Recompute against the quote's OWN frozen rawPriceAtQuote — never the package's current
  // price. An admin repricing the package must not change what this quote sells for, even
  // when the partner edits their markup afterwards.
  if (data.markupAmount !== undefined) {
    updateData.sellingPrice = computeSellingPrice(existing.rawPriceAtQuote, data.markupAmount);
  }

  // Informational only, computed from the live package for the caller's benefit.
  const rawPriceChangedSinceQuote = rawPriceDrifted(existing, existing.package.rawPrice);

  await prisma.quote.update({ where: { id }, data: updateData });
  await refreshQuotePdf(id);

  return { quote: await getForUser(id, user), rawPriceChangedSinceQuote };
}

/** Partner marks "my customer said yes". The payment flow (step 6) keys off this status. */
async function confirmCustomer(id, user) {
  const existing = await getForUser(id, user);

  if (existing.status !== 'QUOTE_GENERATED') {
    throw ApiError.conflict(
      `Cannot confirm from status ${existing.status}. Only QUOTE_GENERATED quotes can be confirmed.`
    );
  }

  await prisma.quote.update({ where: { id }, data: { status: 'CUSTOMER_APPROVED' } });

  return getForUser(id, user);
}

/**
 * Soft delete (locked rule 1).
 *
 * Blocked once a booking is confirmed or the order is complete: those rows are the commercial
 * record behind a verified payment, and hiding them from default queries would make the money
 * trail incomplete. Earlier statuses (and REJECTED) stay archivable.
 */
async function archive(id, user) {
  const existing = await getForUser(id, user);

  if (NON_ARCHIVABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict(
      `Cannot archive a confirmed/completed quote (status: ${existing.status}).`
    );
  }

  if (existing.archived) return { quote: existing, alreadyInState: true };

  await prisma.quote.update({ where: { id }, data: { archived: true } });

  return { quote: await getForUser(id, user), alreadyInState: false };
}

/**
 * Resolves the quote PDF for streaming, regenerating if the path is missing or the file has
 * gone. Never consults payment state — locked rule 3: both quote PDFs are always downloadable,
 * before and without any payment.
 */
async function getQuotePdf(id, user) {
  const quote = await getForUser(id, user);

  const pkg = await prisma.package.findUnique({
    where: { id: quote.packageId },
    ...PACKAGE_FOR_QUOTE,
  });
  const profile = await prisma.partnerProfile.findUnique({ where: { userId: quote.partnerId } });

  if (quote.pdfPath) {
    const abs = resolveStoragePath(quote.pdfPath);
    if (fs.existsSync(abs)) return { absolutePath: abs, quote, package: pkg, partnerProfile: profile };
  }

  const relativePath = await refreshQuotePdf(id);

  return {
    absolutePath: resolveStoragePath(relativePath),
    quote,
    package: pkg,
    partnerProfile: profile,
  };
}

module.exports = {
  create,
  list,
  getById,
  update,
  confirmCustomer,
  archive,
  getQuotePdf,
  computeSellingPrice,
  rawPriceDrifted,
  EDITABLE_STATUSES,
  NON_ARCHIVABLE_STATUSES,
};
