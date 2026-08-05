const fs = require('fs');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const destinationService = require('./destinationService');
const attachmentService = require('./attachmentService');
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
  // A reference, not a copy: the policy that applies is whatever it says TODAY, right up until a
  // quote is generated, at which point quoteSnapshotService freezes it with everything else. That
  // is the difference between "our terms changed" and "your terms changed after you booked".
  cancellationPolicy: {
    include: { tiers: { where: { archived: false }, orderBy: { daysBeforeTravelMin: 'asc' } } },
  },
};

// Marketplace list projection — summary only, no day/hotel detail.
const SUMMARY_SELECT = {
  id: true,
  title: true,
  days: true,
  nights: true,
  adultRawPrice: true,
  childRawPrice: true,
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

  // Events come along on purpose. A day template that arrives without its schedule leaves the
  // admin rebuilding the day event by event, which is the work the library exists to avoid.
  const templates = await tx.dayTemplate.findMany({
    where: { id: { in: distinctIds } },
    include: {
      events: {
        where: { archived: false, parentEventId: null },
        orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
        include: {
          subEvents: {
            where: { archived: false },
            orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
          },
        },
      },
    },
  });
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
      brief: template.brief,
      notes: template.notes,
      inclusions: template.inclusions,
      coverImageUrl: template.coverImageUrl,
      mealsIncluded: template.mealsIncluded,
      // Carried separately from the day's own columns because events are rows, not fields — the
      // caller inserts the day first and then these against the id it gets back.
      events: template.events.map(copyEvent),
    };
  });
}

/**
 * Translates a DayTemplateEvent into the PackageDayEvent shape, sub-events included.
 *
 * A field-for-field copy rather than a reference: the package must not change when the library
 * does (locked rule 2). Written as one function so the two models cannot drift apart silently —
 * adding a column to one and forgetting the other shows up here.
 */
function copyEvent(event, index = 0) {
  return {
    sortOrder: index,
    title: event.title,
    description: event.description,
    type: event.type,
    startMinute: event.startMinute,
    durationMinutes: event.durationMinutes,
    mealsIncluded: event.mealsIncluded,
    availability: event.availability,
    transferMode: event.transferMode,
    luggageAllowance: event.luggageAllowance,
    subEvents: (event.subEvents ?? []).map((sub, subIndex) => copyEvent(sub, subIndex)),
  };
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
      // Everything below used to be dropped on the floor, leaving an admin to retype the address,
      // star rating, map link and check-in times for every package this hotel appeared in.
      hotelAddress: hotel.address,
      coverImageUrl: hotel.coverImageUrl ?? hotel.images?.[0] ?? null,
      starRating: hotel.starRating,
      mapLink: hotel.mapLink,
      googleRating: hotel.googleRating,
      googleRatingCount: hotel.googleRatingCount,
      checkInMinute: hotel.checkInMinute,
      checkOutMinute: hotel.checkOutMinute,
      roomType: hotel.roomType,
      mealPlan: hotel.mealPlan,
      refundable: hotel.refundable,
      servicesOffered: hotel.servicesOffered,
      sortOrder: index, // 0-based position in the caller's hotelIds array
    };
  });
}

/**
 * Inserts copied days and their events.
 *
 * One day at a time rather than createMany, because each day's events need the id the day gets on
 * insert — and an event's sub-events need the id of their parent event. createMany returns counts,
 * not ids, so it cannot build a tree.
 *
 * The cost is a few extra round trips per package build, which happens rarely and inside a
 * transaction; the alternative is losing the schedule the library was carrying.
 */
async function insertDayCopies(tx, packageId, dayCopies) {
  for (const { events = [], ...day } of dayCopies) {
    const createdDay = await tx.packageDay.create({ data: { ...day, packageId } });

    for (const { subEvents = [], ...event } of events) {
      const createdEvent = await tx.packageDayEvent.create({
        data: { ...event, packageDayId: createdDay.id },
      });

      if (subEvents.length) {
        await tx.packageDayEvent.createMany({
          data: subEvents.map((sub) => ({
            ...sub,
            // A sub-event has no children of its own — nesting is one level deep by design.
            subEvents: undefined,
            packageDayId: createdDay.id,
            parentEventId: createdEvent.id,
          })),
        });
      }
    }
  }
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
    adultRawPrice,
    childRawPrice,
    inclusions,
    exclusions,
    gallery,
    tags,
    dayTemplateIds,
    hotelIds,
    // Phase 6: what the package draws from the library.
    cancellationPolicyId,
    faqIds,
    inclusionIds,
    exclusionIds,
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
        adultRawPrice,
        childRawPrice,
        inclusions,
        exclusions,
        gallery,
        tags,
        cancellationPolicyId: cancellationPolicyId ?? null,
      },
    });

    await insertDayCopies(tx, pkg.id, dayCopies);

    if (hotelCopies.length) {
      await tx.packageHotel.createMany({
        data: hotelCopies.map((h) => ({ ...h, packageId: pkg.id })),
      });
    }

    return pkg;
  });

  await syncLibraryLinks(created.id, { faqIds, inclusionIds, exclusionIds }, data.actor);
  await refreshEmvQuote(created.id);

  return getById(created.id);
}

/**
 * Package-level edits, plus optional wholesale replacement of the itinerary/hotels.
 *
 * Replacement archives the existing copies and inserts fresh ones (never a hard delete —
 * locked rule 1), so the superseded itinerary stays auditable.
 */
/**
 * Records which library items a package draws on.
 *
 * Links, not copies — and deliberately so, unlike the itinerary and hotels above.
 *
 * The distinction is what each thing IS. A copied day is what the customer was sold, and must never
 * move; an attached FAQ or inclusion vocabulary item is a statement about what this package is
 * ABOUT, used to group, filter and report on it. Nothing a customer was told hangs off these, so
 * there is nothing to freeze. The prose a customer actually reads still lives in
 * `Package.inclusions` / `Package.exclusions`, which the builder composes from these items and then
 * stores as text — so editing the vocabulary later changes future packages, never an issued quote.
 *
 * Runs outside the package transaction on purpose: a failure here must not roll back a package that
 * is otherwise complete and correct. The links are catalogue metadata, not part of the product.
 */
async function syncLibraryLinks(packageId, { faqIds, inclusionIds, exclusionIds }, actor) {
  const sets = [
    ['faq', 'faq', faqIds],
    ['lookup', 'inclusion', inclusionIds],
    ['lookup', 'exclusion', exclusionIds],
  ];

  for (const [entity, role, ids] of sets) {
    if (!Array.isArray(ids)) continue; // undefined means "leave alone"

    try {
      await attachmentService.setLinks(entity, 'Package', packageId, ids, { user: actor, role });
    } catch (error) {
      // Logged rather than thrown: see above. A package with a missing tag is a lesser problem than
      // a package that failed to save.
      console.error(`[packageService] could not attach ${role} to package ${packageId}:`, error.message);
    }
  }
}

async function update(id, data) {
  const existing = await getById(id); // 404 if missing

  const { dayTemplateIds, hotelIds, faqIds, inclusionIds, exclusionIds, actor, ...scalarFields } = data;

  // The day count must stay consistent with whatever the package ends up saying. Compare the
  // resulting values, not just the incoming ones — changing `days` alone must also fail.
  const finalDays = scalarFields.days ?? existing.days;
  const finalDayCount = dayTemplateIds ? dayTemplateIds.length : existing.packageDays.length;
  assertDayCountMatches(finalDays, finalDayCount);

  await prisma.$transaction(async (tx) => {
    if (dayTemplateIds) {
      const dayCopies = await buildDayCopies(tx, existing.destinationId, dayTemplateIds);

      // Archive the days AND their events together: an event whose day has been superseded must
      // not keep showing on the itinerary.
      const supersededDays = await tx.packageDay.findMany({
        where: { packageId: id, archived: false },
        select: { id: true },
      });

      if (supersededDays.length) {
        await tx.packageDayEvent.updateMany({
          where: { packageDayId: { in: supersededDays.map((d) => d.id) }, archived: false },
          data: { archived: true },
        });
      }

      await tx.packageDay.updateMany({
        where: { packageId: id, archived: false },
        data: { archived: true },
      });

      await insertDayCopies(tx, id, dayCopies);
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

  await syncLibraryLinks(id, { faqIds, inclusionIds, exclusionIds }, actor);
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
    limit = 50,
    offset = 0,
  } = filters;

  const where = {};

  if (!includeArchived) {
    where.archived = false;
    where.destination = { is: { archived: false } };
  }

  if (destinationId) where.destinationId = destinationId;
  if (tag) where.tags = { has: tag };
  if (search) where.title = { contains: search, mode: 'insensitive' };

  // Filters against the adult rate — the "starting from" number a partner compares packages by.
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.adultRawPrice = {};
    if (minPrice !== undefined) where.adultRawPrice.gte = minPrice;
    if (maxPrice !== undefined) where.adultRawPrice.lte = maxPrice;
  }

  if (minDays !== undefined || maxDays !== undefined) {
    where.days = {};
    if (minDays !== undefined) where.days.gte = minDays;
    if (maxDays !== undefined) where.days.lte = maxDays;
  }

  const [packages, total] = await Promise.all([
    prisma.package.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.package.count({ where }),
  ]);

  return { packages, total, limit, offset };
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

  // Library attachments come back with the package so the builder can re-open showing what was
  // chosen, rather than a form that forgets its own selections on every reload.
  const [faqs, inclusionItems, exclusionItems] = await Promise.all([
    attachmentService.getLinked('faq', 'Package', id, { role: 'faq' }),
    attachmentService.getLinked('lookup', 'Package', id, { role: 'inclusion' }),
    attachmentService.getLinked('lookup', 'Package', id, { role: 'exclusion' }),
  ]);

  return { ...pkg, library: { faqs, inclusionItems, exclusionItems } };
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
