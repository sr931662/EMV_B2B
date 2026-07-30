const fs = require('fs');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const destinationService = require('./destinationService');
const { generateEmvQuotePdf, resolveStoragePath } = require('./pdfService');

const DESTINATION_SUMMARY = {
  select: {
    id: true,
    name: true,
    archived: true,
    aboutDestination: true,
    packages: true,
    faqs: true,
  },
};

// Full itinerary-page payload. Archived child rows are excluded: a package edit archives the
// previous PackageDay/PackageHotel rows rather than deleting them (locked rule 1), so the
// superseded copies are still on disk and must never leak into the current itinerary.
const FULL_PACKAGE_INCLUDE = {
  destination: DESTINATION_SUMMARY,
  packageDays: { where: { archived: false }, orderBy: { dayNumber: 'asc' } },
  // Ordered by the admin's selection order, not alphabetically — see PackageHotel.sortOrder.
  packageHotels: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
};

// Marketplace list projection — summary only, no day/hotel detail.
const SUMMARY_SELECT = {
  id: true,
  title: true,
  days: true,
  nights: true,
  rawPrice: true,
  tags: true,
  gallery: true,
  emvQuotePdfPath: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
  destination: DESTINATION_SUMMARY,
};

/**
 * COPY-ON-SELECT for itinerary days (locked rule 2).
 *
 * Returns plain objects holding only *copied scalar values*. Nothing in the result references
 * the source DayTemplate — there is no FK column to put it in, by design. Once written, the
 * package's itinerary is frozen and library edits cannot reach it.
 *
 * The same template id may appear more than once; each position becomes its own copy, so we
 * look up the distinct ids and then walk the caller's array in order.
 */
async function buildDayCopies(tx, destinationId, dayTemplateIds) {
  const distinctIds = [...new Set(dayTemplateIds)];

  const templates = await tx.dayTemplate.findMany({ where: { id: { in: distinctIds } } });
  const byId = new Map(templates.map((t) => [t.id, t]));

  return dayTemplateIds.map((id, index) => {
    const template = byId.get(id);
    const at = `dayTemplateIds[${index}] (${id})`;

    if (!template) throw ApiError.badRequest(`${at}: no day template exists with this id`);
    if (template.archived) {
      throw ApiError.badRequest(`${at}: day template "${template.title}" is archived`);
    }
    if (template.destinationId !== destinationId) {
      throw ApiError.badRequest(
        `${at}: day template "${template.title}" belongs to a different destination than this package`
      );
    }

    return {
      dayNumber: index + 1, // position in the caller's array, 1-based
      title: template.title,
      description: template.description,
    };
  });
}

/** COPY-ON-SELECT for hotels (locked rule 2). Same contract as buildDayCopies. */
async function buildHotelCopies(tx, destinationId, hotelIds) {
  const distinctIds = [...new Set(hotelIds)];

  const hotels = await tx.hotel.findMany({ where: { id: { in: distinctIds } } });
  const byId = new Map(hotels.map((h) => [h.id, h]));

  return hotelIds.map((id, index) => {
    const hotel = byId.get(id);
    const at = `hotelIds[${index}] (${id})`;

    if (!hotel) throw ApiError.badRequest(`${at}: no hotel exists with this id`);
    if (hotel.archived) throw ApiError.badRequest(`${at}: hotel "${hotel.name}" is archived`);
    if (hotel.destinationId !== destinationId) {
      throw ApiError.badRequest(
        `${at}: hotel "${hotel.name}" belongs to a different destination than this package`
      );
    }

    return {
      hotelName: hotel.name,
      hotelCategory: hotel.category,
      hotelDescription: hotel.description,
      sortOrder: index, // 0-based position in the caller's hotelIds array
    };
  });
}

function assertDayCountMatches(days, dayTemplateCount) {
  if (days === dayTemplateCount) return;

  const diff = Math.abs(days - dayTemplateCount);
  const direction = days > dayTemplateCount ? 'too few' : 'too many';

  throw ApiError.badRequest(
    `Itinerary must cover every day: days=${days} but dayTemplateIds has ${dayTemplateCount} ` +
      `entr${dayTemplateCount === 1 ? 'y' : 'ies'} (${direction} by ${diff}). ` +
      `Send exactly ${days} day template id${days === 1 ? '' : 's'}, or change days to ${dayTemplateCount}.`
  );
}

/**
 * Regenerates the EMV quote PDF and stores its path.
 *
 * Deliberately runs AFTER the database transaction commits: writing a file cannot participate
 * in a DB transaction, and holding the transaction open across filesystem I/O is worse than
 * the failure mode it would prevent. If generation fails the package still exists with a null
 * emvQuotePdfPath, and the download route regenerates on demand — so the quote is never
 * permanently missing (locked rule 3: always available).
 */
async function refreshEmvQuote(packageId) {
  const full = await prisma.package.findUnique({
    where: { id: packageId },
    include: FULL_PACKAGE_INCLUDE,
  });

  const relativePath = await generateEmvQuotePdf(full);

  await prisma.package.update({
    where: { id: packageId },
    data: { emvQuotePdfPath: relativePath },
  });

  return relativePath;
}

async function create(data) {
  const {
    destinationId,
    title,
    days,
    nights,
    rawPrice,
    inclusions,
    exclusions,
    gallery,
    tags,
    dayTemplateIds,
    hotelIds,
  } = data;

  await destinationService.assertActiveDestination(destinationId);
  assertDayCountMatches(days, dayTemplateIds.length);

  // Package + every copied day + every copied hotel commit together or not at all.
  const created = await prisma.$transaction(async (tx) => {
    const dayCopies = await buildDayCopies(tx, destinationId, dayTemplateIds);
    const hotelCopies = await buildHotelCopies(tx, destinationId, hotelIds);

    const pkg = await tx.package.create({
      data: {
        destinationId,
        title,
        days,
        nights,
        rawPrice,
        inclusions,
        exclusions,
        gallery,
        tags,
      },
    });

    if (dayCopies.length) {
      await tx.packageDay.createMany({
        data: dayCopies.map((d) => ({ ...d, packageId: pkg.id })),
      });
    }
    if (hotelCopies.length) {
      await tx.packageHotel.createMany({
        data: hotelCopies.map((h) => ({ ...h, packageId: pkg.id })),
      });
    }

    return pkg;
  });

  await refreshEmvQuote(created.id);

  return getById(created.id);
}

/**
 * Package-level edits, plus optional wholesale replacement of the itinerary/hotels.
 *
 * Replacement archives the existing copies and inserts fresh ones (never a hard delete —
 * locked rule 1), so the superseded itinerary stays auditable.
 */
async function update(id, data) {
  const existing = await getById(id); // 404 if missing

  const { dayTemplateIds, hotelIds, ...scalarFields } = data;

  // The day count must stay consistent with whatever the package ends up saying. Compare the
  // resulting values, not just the incoming ones — changing `days` alone must also fail.
  const finalDays = scalarFields.days ?? existing.days;
  const finalDayCount = dayTemplateIds ? dayTemplateIds.length : existing.packageDays.length;
  assertDayCountMatches(finalDays, finalDayCount);

  await prisma.$transaction(async (tx) => {
    if (dayTemplateIds) {
      const dayCopies = await buildDayCopies(tx, existing.destinationId, dayTemplateIds);

      await tx.packageDay.updateMany({
        where: { packageId: id, archived: false },
        data: { archived: true },
      });
      await tx.packageDay.createMany({
        data: dayCopies.map((d) => ({ ...d, packageId: id })),
      });
    }

    if (hotelIds) {
      const hotelCopies = await buildHotelCopies(tx, existing.destinationId, hotelIds);

      await tx.packageHotel.updateMany({
        where: { packageId: id, archived: false },
        data: { archived: true },
      });
      if (hotelCopies.length) {
        await tx.packageHotel.createMany({
          data: hotelCopies.map((h) => ({ ...h, packageId: id })),
        });
      }
    }

    if (Object.keys(scalarFields).length) {
      await tx.package.update({ where: { id }, data: scalarFields });
    }
  });

  await refreshEmvQuote(id);

  return getById(id);
}

/**
 * Marketplace list. Excludes archived packages and packages under an archived destination,
 * consistent with the Option B read-time filter used by the libraries.
 */
async function list(filters = {}) {
  const {
    destinationId,
    tag,
    minPrice,
    maxPrice,
    minDays,
    maxDays,
    search,
    includeArchived = false,
  } = filters;

  const where = {};

  if (!includeArchived) {
    where.archived = false;
    where.destination = { is: { archived: false } };
  }

  if (destinationId) where.destinationId = destinationId;
  if (tag) where.tags = { has: tag };
  if (search) where.title = { contains: search, mode: 'insensitive' };

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.rawPrice = {};
    if (minPrice !== undefined) where.rawPrice.gte = minPrice;
    if (maxPrice !== undefined) where.rawPrice.lte = maxPrice;
  }

  if (minDays !== undefined || maxDays !== undefined) {
    where.days = {};
    if (minDays !== undefined) where.days.gte = minDays;
    if (maxDays !== undefined) where.days.lte = maxDays;
  }

  return prisma.package.findMany({
    where,
    select: SUMMARY_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Full itinerary-page payload. Returns archived packages and packages under an archived
 * destination too — a direct fetch by id is deliberate, not browsing. The controller exposes
 * `destinationArchived` so the UI can warn.
 */
async function getById(id) {
  const pkg = await prisma.package.findUnique({
    where: { id },
    include: FULL_PACKAGE_INCLUDE,
  });

  if (!pkg) throw ApiError.notFound(`No package exists with id ${id}`);

  return pkg;
}

/** Soft delete (locked rule 1). */
async function archive(id) {
  const pkg = await getById(id);

  if (pkg.archived) return { package: pkg, alreadyInState: true };

  await prisma.package.update({ where: { id }, data: { archived: true } });

  return { package: await getById(id), alreadyInState: false };
}

/** Refused under an archived destination, mirroring the library restore rule. */
async function restore(id) {
  const pkg = await getById(id);

  if (!pkg.archived) return { package: pkg, alreadyInState: true };

  await destinationService.assertActiveDestination(pkg.destinationId);
  await prisma.package.update({ where: { id }, data: { archived: false } });

  return { package: await getById(id), alreadyInState: false };
}

/**
 * Resolves the EMV quote PDF for streaming, generating it if the row predates PDF generation
 * or the file has gone missing from disk. Never consults payment state — locked rule 3: both
 * quote PDFs are always available, before and without any payment.
 */
async function getEmvQuotePdfPath(id) {
  const pkg = await getById(id);

  if (pkg.emvQuotePdfPath) {
    const abs = resolveStoragePath(pkg.emvQuotePdfPath);
    if (fs.existsSync(abs)) return { absolutePath: abs, package: pkg, regenerated: false };
  }

  const relativePath = await refreshEmvQuote(id);

  return { absolutePath: resolveStoragePath(relativePath), package: pkg, regenerated: true };
}

module.exports = {
  create,
  update,
  list,
  getById,
  archive,
  restore,
  getEmvQuotePdfPath,
  refreshEmvQuote,
};
