const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

// ---------------------------------------------------------------------------
// Document profiles
// ---------------------------------------------------------------------------
//
// The "documents required" filter offers profiles (only passport / passport + bank statements /
// + income tax return / with a US-UK-Schengen visa), not individual documents. Those profiles are
// DERIVED from the categories on a product's checklist and never stored, so they cannot drift away
// from the checklist an admin actually maintains.
//
// The ladder is ordered by how hard the paperwork is to produce. PHOTO and OTHER do not move a
// product along it: a passport photo is not a hurdle that changes which visas a traveller can
// realistically get.
const DOCUMENT_PROFILES = ['ONLY_PASSPORT', 'PASSPORT_BANK', 'PASSPORT_BANK_ITR', 'WITH_PRIOR_VISA'];

/**
 * The profile a checklist adds up to. Takes the hardest requirement present, because a product
 * asking for both a passport and an ITR is an "ITR product" — the passport is not what makes it
 * hard to qualify for.
 */
function deriveDocumentProfile(requiredDocuments = []) {
  const categories = new Set(requiredDocuments.filter((d) => !d.archived).map((d) => d.category));

  if (categories.has('PRIOR_VISA')) return 'WITH_PRIOR_VISA';
  if (categories.has('INCOME_TAX_RETURN')) return 'PASSPORT_BANK_ITR';
  if (categories.has('BANK_STATEMENT')) return 'PASSPORT_BANK';
  return 'ONLY_PASSPORT';
}

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------
//
// Visa-free and visa-on-arrival products exist so a partner can SEE that a destination needs no
// visa in advance. There is nothing to apply for and nothing to sell, so the marketplace shows
// them without an apply action and visaRequestService refuses to create a request against them.
const NON_APPLICABLE_CATEGORIES = new Set(['VISA_FREE', 'VISA_ON_ARRIVAL']);

function isApplicable(category) {
  return !NON_APPLICABLE_CATEGORIES.has(category);
}

// ---------------------------------------------------------------------------
// Working-day maths for travel-date feasibility
// ---------------------------------------------------------------------------
//
// Processing times are quoted in WORKING days because that is how consulates quote them, so a
// 5-day visa requested on a Thursday is not ready on Tuesday. Weekends are handled; public
// holidays are not — that would need a per-country holiday calendar, and quietly pretending we
// have one would produce confidently wrong promises.

/** UTC midnight, so a partner's local clock cannot shift a date across a day boundary. */
function toUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Counts working days between two dates, excluding the start day and including the end day. */
function workingDaysBetween(from, to) {
  const cursor = new Date(toUtcDay(from));
  const end = toUtcDay(to);
  let count = 0;

  while (toUtcDay(cursor) < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) count += 1;
  }

  return count;
}

/** The latest day an application can start and still finish within `workingDays`. */
function subtractWorkingDays(date, workingDays) {
  const cursor = new Date(toUtcDay(date));
  let remaining = workingDays;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!isWeekend(cursor)) remaining -= 1;
  }

  return cursor;
}

/**
 * Answers the question a travel agent actually has — "will this visa be ready before my client
 * flies?" — instead of making them translate a processing time into a date themselves.
 *
 * Returns null when no travel date was supplied. Otherwise:
 *   READY_IN_TIME  — with the last date an application can be started
 *   TOO_LATE       — with how many working days short it is
 *   UNKNOWN        — the product has no published timeline; say so rather than guess
 */
function assessFeasibility(product, travelDate) {
  if (!travelDate) return null;

  if (product.processingDaysMax === null || product.processingDaysMax === undefined) {
    return { status: 'UNKNOWN', applyBy: null, workingDaysAvailable: null, shortfallDays: null };
  }

  const now = new Date();
  const available = workingDaysBetween(now, travelDate);
  const needed = product.processingDaysMax;

  if (available >= needed) {
    return {
      status: 'READY_IN_TIME',
      applyBy: subtractWorkingDays(travelDate, needed).toISOString(),
      workingDaysAvailable: available,
      shortfallDays: null,
    };
  }

  return {
    status: 'TOO_LATE',
    applyBy: null,
    workingDaysAvailable: available,
    shortfallDays: needed - available,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const PRODUCT_SELECT = {
  id: true,
  name: true,
  category: true,
  processingDaysMin: true,
  processingDaysMax: true,
  validityDays: true,
  maxStayDays: true,
  entryType: true,
  adultFee: true,
  childFee: true,
  faqs: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
  visaCountry: {
    select: {
      id: true,
      name: true,
      shortName: true,
      coverImageUrl: true,
      flagImageUrl: true,
      aboutCountry: true,
      arrivalInfo: true,
      archived: true,
    },
  },
  processingSteps: {
    where: { archived: false },
    select: { id: true, sortOrder: true, title: true, description: true, estimatedDays: true },
    orderBy: { sortOrder: 'asc' },
  },
  requiredDocuments: {
    where: { archived: false },
    select: { id: true, documentName: true, isMandatory: true, category: true },
    orderBy: { documentName: 'asc' },
  },
};

/**
 * Sums the timeline's estimated days.
 *
 * Returned alongside processingDaysMax rather than replacing it: the steps are an explanation of
 * where the time goes, while processingDaysMax is the promise the filters and the delivery date
 * are built on. When they disagree, the total is what needs correcting, not the promise — so the
 * API surfaces both and lets the admin see the discrepancy instead of silently reconciling it.
 */
function summariseTimeline(steps = [], processingDaysMax) {
  if (steps.length === 0) return null;

  const withEstimates = steps.filter((s) => s.estimatedDays !== null && s.estimatedDays !== undefined);
  const totalDays = withEstimates.reduce((sum, s) => sum + s.estimatedDays, 0);

  return {
    stepCount: steps.length,
    totalDays,
    // True only when every step has a number AND they add up to the published time.
    complete: withEstimates.length === steps.length,
    matchesPublishedTime:
      processingDaysMax === null || processingDaysMax === undefined
        ? null
        : totalDays === processingDaysMax,
  };
}

/** Shapes one row for the API: derived fields computed here so no caller has to re-derive them. */
function present(product, travelDate) {
  const { requiredDocuments, processingSteps, ...rest } = product;

  return {
    ...rest,
    requiredDocuments,
    processingSteps,
    timeline: summariseTimeline(processingSteps, product.processingDaysMax),
    documentProfile: deriveDocumentProfile(requiredDocuments),
    applicable: isApplicable(product.category),
    feasibility: assessFeasibility(product, travelDate),
  };
}

/**
 * Marketplace list.
 *
 * Filter semantics worth knowing:
 *
 *   maxProcessingDays  is "no slower than", so the UI's nested buckets (instant ⊂ within a day ⊂
 *                      within a week ⊂ within a month) fall out of a single `<=` with no special
 *                      cases. Products with no published timeline are excluded, because a product
 *                      that has never promised a speed cannot satisfy a speed requirement.
 *
 *   documentProfile    is "at most this much paperwork", not "exactly this". A partner picking
 *                      "Passport & Bank Statements" is saying what their client can provide, so
 *                      products needing only a passport must stay in the results — they qualify
 *                      for those too. Exact-match would hide the easiest options.
 *                      Derived per row, so it cannot be pushed into the SQL WHERE.
 *
 *   travelDate         annotates rather than filters, so a partner can see WHY something will not
 *                      make it and by how much. Pass onlyFeasible to actually drop them.
 */
async function list(filters = {}) {
  const {
    visaCountryId,
    category,
    maxProcessingDays,
    documentProfile,
    travelDate,
    onlyFeasible = false,
    search,
    includeArchived = false,
  } = filters;

  const where = {};

  if (!includeArchived) {
    where.archived = false;
    // Same read-time exclusion the package marketplace uses: a product under an archived country
    // must not surface, even though the product row itself is still active.
    where.visaCountry = { is: { archived: false } };
  }

  if (visaCountryId) where.visaCountryId = visaCountryId;
  if (category) where.category = category;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  if (maxProcessingDays !== undefined) {
    where.processingDaysMax = { not: null, lte: maxProcessingDays };
  }

  const rows = await prisma.visaProduct.findMany({
    where,
    select: PRODUCT_SELECT,
    // Fastest first: the partner filtering by speed almost always wants the quickest option, and
    // NULL timelines belong at the bottom rather than the top.
    orderBy: [{ processingDaysMax: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  });

  let products = rows.map((p) => present(p, travelDate));

  if (documentProfile) {
    const ceiling = DOCUMENT_PROFILES.indexOf(documentProfile);
    products = products.filter((p) => DOCUMENT_PROFILES.indexOf(p.documentProfile) <= ceiling);
  }

  if (onlyFeasible && travelDate) {
    products = products.filter((p) => p.feasibility?.status === 'READY_IN_TIME');
  }

  return products;
}

/**
 * "Explore other similar visa types" for the detail page.
 *
 * Derived, never stored: a curated relation would be one more thing for an admin to maintain and
 * would rot the moment a product was archived. Same country first (a partner comparing options for
 * one destination is the common case), then the same category elsewhere.
 */
async function findSimilar(product, limit = 6) {
  const shared = {
    archived: false,
    id: { not: product.id },
    visaCountry: { is: { archived: false } },
  };

  const sameCountry = await prisma.visaProduct.findMany({
    where: { ...shared, visaCountryId: product.visaCountryId },
    select: PRODUCT_SELECT,
    orderBy: [{ processingDaysMax: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    take: limit,
  });

  const remaining = limit - sameCountry.length;
  const sameCategory = remaining > 0
    ? await prisma.visaProduct.findMany({
        where: {
          ...shared,
          category: product.category,
          visaCountryId: { not: product.visaCountryId },
        },
        select: PRODUCT_SELECT,
        orderBy: [{ processingDaysMax: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        take: remaining,
      })
    : [];

  return [...sameCountry, ...sameCategory].map((p) => present(p));
}

/** Returns archived rows too — an admin has to be able to inspect one before restoring it. */
async function getById(id, { travelDate, includeSimilar = false } = {}) {
  const product = await prisma.visaProduct.findUnique({ where: { id }, select: PRODUCT_SELECT });

  if (!product) throw ApiError.notFound(`No visa product exists with id ${id}`);

  const presented = present(product, travelDate);

  if (includeSimilar) {
    presented.similarProducts = await findSimilar(product);
  }

  return presented;
}

/**
 * Guard for visaRequestService: a request may only be created against a product that exists, is
 * not archived, sits under a live country, and is something you can actually apply for.
 *
 * Mirrors visaCountryService.assertActiveVisaCountry.
 */
async function assertApplicableProduct(visaProductId) {
  const product = await prisma.visaProduct.findUnique({
    where: { id: visaProductId },
    select: {
      id: true,
      name: true,
      category: true,
      adultFee: true,
      childFee: true,
      archived: true,
      visaCountryId: true,
      visaCountry: { select: { name: true, archived: true } },
    },
  });

  if (!product) {
    throw ApiError.badRequest(`No visa product exists with id ${visaProductId}`);
  }
  if (product.archived) {
    throw ApiError.badRequest(
      `Visa product "${product.name}" is archived. Restore it before creating new requests for it.`
    );
  }
  if (product.visaCountry.archived) {
    throw ApiError.badRequest(
      `Visa country "${product.visaCountry.name}" is archived. Restore it before creating new requests for it.`
    );
  }
  if (!isApplicable(product.category)) {
    throw ApiError.badRequest(
      `"${product.name}" is a ${product.category.replace(/_/g, ' ').toLowerCase()} entry, which needs no ` +
        'visa application. It is listed for information only.'
    );
  }

  return product;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function assertCountryExists(visaCountryId) {
  const country = await prisma.visaCountry.findUnique({
    where: { id: visaCountryId },
    select: { id: true, name: true, archived: true },
  });

  if (!country) throw ApiError.badRequest(`No visa country exists with id ${visaCountryId}`);

  return country;
}

async function create({
  visaCountryId,
  name,
  category,
  processingDaysMin,
  processingDaysMax,
  validityDays,
  maxStayDays,
  entryType,
  adultFee = 0,
  childFee = 0,
  faqs,
  requiredDocuments = [],
  processingSteps = [],
}) {
  await assertCountryExists(visaCountryId);

  // Unique per country, not globally: "Tourist eVisa" is a perfectly normal name to reuse across
  // countries, but two of them under one country would be indistinguishable in the picker.
  const clash = await prisma.visaProduct.findFirst({
    where: { visaCountryId, name: { equals: name, mode: 'insensitive' }, archived: false },
    select: { id: true, name: true },
  });

  if (clash) {
    throw ApiError.conflict(`A visa product named "${clash.name}" already exists for this country`);
  }

  const created = await prisma.visaProduct.create({
    data: {
      visaCountryId,
      name,
      category,
      processingDaysMin,
      processingDaysMax,
      validityDays,
      maxStayDays,
      entryType,
      adultFee,
      childFee,
      faqs,
      requiredDocuments: { create: requiredDocuments },
      // sortOrder comes from the array position, so the admin UI never has to manage the numbers.
      processingSteps: {
        create: processingSteps.map((step, index) => ({ ...step, sortOrder: index })),
      },
    },
    select: PRODUCT_SELECT,
  });

  return present(created);
}

/**
 * Update. requiredDocuments follows the archive-and-replace pattern used elsewhere in the app
 * (locked rule 1): superseded rows are archived rather than deleted, so any VisaRequest that
 * snapshotted the old checklist still has intact history to point back at.
 */
async function update(
  id,
  {
    name,
    category,
    processingDaysMin,
    processingDaysMax,
    validityDays,
    maxStayDays,
    entryType,
    adultFee,
    childFee,
    faqs,
    requiredDocuments,
    processingSteps,
  }
) {
  const existing = await prisma.visaProduct.findUnique({
    where: { id },
    select: { id: true, visaCountryId: true },
  });

  if (!existing) throw ApiError.notFound(`No visa product exists with id ${id}`);

  if (name !== undefined) {
    const clash = await prisma.visaProduct.findFirst({
      where: {
        visaCountryId: existing.visaCountryId,
        name: { equals: name, mode: 'insensitive' },
        archived: false,
        id: { not: id },
      },
      select: { name: true },
    });

    if (clash) {
      throw ApiError.conflict(`A visa product named "${clash.name}" already exists for this country`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (requiredDocuments !== undefined) {
      await tx.visaRequiredDocument.updateMany({
        where: { visaProductId: id, archived: false },
        data: { archived: true },
      });

      if (requiredDocuments.length > 0) {
        await tx.visaRequiredDocument.createMany({
          data: requiredDocuments.map((d) => ({ ...d, visaProductId: id })),
        });
      }
    }

    // Same archive-and-replace pattern: steps are never hard-deleted, so a request that was
    // created while an older timeline was published still has intact history behind it.
    if (processingSteps !== undefined) {
      await tx.visaProcessingStep.updateMany({
        where: { visaProductId: id, archived: false },
        data: { archived: true },
      });

      if (processingSteps.length > 0) {
        await tx.visaProcessingStep.createMany({
          data: processingSteps.map((step, index) => ({
            ...step,
            sortOrder: index,
            visaProductId: id,
          })),
        });
      }
    }

    return tx.visaProduct.update({
      where: { id },
      data: {
        name,
        category,
        processingDaysMin,
        processingDaysMax,
        validityDays,
        maxStayDays,
        entryType,
        adultFee,
        childFee,
        faqs,
      },
      select: PRODUCT_SELECT,
    });
  });

  return present(updated);
}

async function setArchived(id, archived) {
  await getById(id); // 404 if missing

  const updated = await prisma.visaProduct.update({
    where: { id },
    data: { archived },
    select: PRODUCT_SELECT,
  });

  return present(updated);
}

module.exports = {
  list,
  getById,
  findSimilar,
  summariseTimeline,
  create,
  update,
  setArchived,
  assertApplicableProduct,
  deriveDocumentProfile,
  assessFeasibility,
  isApplicable,
  DOCUMENT_PROFILES,
};
