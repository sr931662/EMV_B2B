const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const countryService = require('./countryService');
const { buildSearchText } = require('../utils/searchText');

function normalizeNullableText(value) {
  if (value === undefined) return undefined;
  return value ? value : null;
}

/**
 * Keeps the trigram haystack in step. Same fields as libraryRegistry.destination — the two must
 * agree or a destination created here is unfindable in the picker that lists it.
 */
function searchTextFor(row) {
  return buildSearchText(row.name, row.shortName, row.city, row.state);
}

/**
 * Resolves the country a destination sits under, from either an id or a name.
 *
 * A name is accepted because that is what the existing form and any CSV import send, and because
 * refusing it would leave people with the one option that breaks the hierarchy: leaving it blank.
 * Creating the country on first mention is deliberate — the alternative is a two-step "go and add
 * the country first" that nobody does.
 */
async function resolveCountry(client, { countryId, countryName }) {
  if (countryId) {
    const country = await client.country.findUnique({ where: { id: countryId } });

    if (!country) throw ApiError.badRequest(`No country exists with id ${countryId}`);
    if (country.archived) {
      throw ApiError.badRequest(
        `Country "${country.name}" is archived. Restore it before adding destinations to it.`
      );
    }

    return country.id;
  }

  if (countryName) return (await countryService.findOrCreateByName(client, countryName)).id;

  return undefined;
}

/**
 * Guard used by dayTemplateService and hotelService: a library entry may only hang off a
 * destination that exists and is not archived. Lives here because this service owns the
 * Destination model.
 */
async function assertActiveDestination(destinationId) {
  const destination = await prisma.destination.findUnique({
    where: { id: destinationId },
    select: { id: true, name: true, archived: true },
  });

  if (!destination) {
    throw ApiError.badRequest(`No destination exists with id ${destinationId}`);
  }
  if (destination.archived) {
    throw ApiError.badRequest(
      `Destination "${destination.name}" is archived. Restore it before adding library entries to it.`
    );
  }

  return destination;
}

/**
 * Create a destination.
 *
 * Name matching is case-insensitive, so the intern-maintained library cannot accumulate
 * "Dubai"/"dubai"/"DUBAI" as three destinations.
 *
 * If the match is archived we restore it rather than 409 — otherwise an archived name is
 * permanently unusable, since the unique constraint blocks re-creating it (dead-name lockout).
 */
async function create({
  name,
  aboutDestination,
  packages,
  faqs,
  countryId,
  countryName,
  state,
  city,
  shortName,
}) {
  const existing = await prisma.destination.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing && !existing.archived) {
    throw ApiError.conflict(`A destination named "${existing.name}" already exists`);
  }

  return prisma.$transaction(async (tx) => {
    // Phase 3: a destination with no country is the row that stops the hierarchy from ever being
    // enforced. When the caller names neither, fall back to a country of the same name — which is
    // exactly what the flat table meant before this migration, made explicit rather than implied.
    const resolvedCountryId =
      (await resolveCountry(tx, { countryId, countryName })) ??
      (await countryService.findOrCreateByName(tx, name)).id;

    const shared = {
      name,
      countryId: resolvedCountryId,
      state: normalizeNullableText(state),
      city: normalizeNullableText(city),
      shortName: normalizeNullableText(shortName),
    };

    if (existing && existing.archived) {
      const restored = await tx.destination.update({
        where: { id: existing.id },
        data: {
          ...shared,
          archived: false,
          aboutDestination:
            normalizeNullableText(aboutDestination) ?? existing.aboutDestination,
          packages: normalizeNullableText(packages) ?? existing.packages,
          faqs: normalizeNullableText(faqs) ?? existing.faqs,
          searchText: searchTextFor({ ...existing, ...shared }),
        }, // adopt the casing the caller just supplied
      });

      return { destination: restored, restored: true };
    }

    const created = await tx.destination.create({
      data: {
        ...shared,
        aboutDestination: normalizeNullableText(aboutDestination) ?? null,
        packages: normalizeNullableText(packages) ?? null,
        faqs: normalizeNullableText(faqs) ?? null,
        searchText: searchTextFor(shared),
      },
    });

    return { destination: created, restored: false };
  });
}

async function list({ includeArchived = false, countryId, limit = 50, offset = 0 } = {}) {
  const where = {
    ...(includeArchived ? {} : { archived: false }),
    ...(countryId ? { countryId } : {}),
  };

  const [destinations, total] = await Promise.all([
    prisma.destination.findMany({
      where,
      orderBy: { name: 'asc' },
      // The country comes back with the row rather than as a second request: every screen that
      // lists destinations wants to show which country each one is in, and a lookup per row is how
      // a hierarchy becomes slower than the flat list it replaced.
      include: {
        country: { select: { id: true, name: true, isoAlpha2: true, flagImageUrl: true } },
      },
      take: limit,
      skip: offset,
    }),
    prisma.destination.count({ where }),
  ]);

  return { destinations, total, limit, offset };
}

/** Returns archived rows too — an admin has to be able to look at one before restoring it. */
async function getById(id) {
  const destination = await prisma.destination.findUnique({
    where: { id },
    include: {
      country: { select: { id: true, name: true, isoAlpha2: true, flagImageUrl: true } },
    },
  });

  if (!destination) throw ApiError.notFound(`No destination exists with id ${id}`);

  return destination;
}

async function update(id, data) {
  const existing = await getById(id); // 404 if missing

  const nextName = data.name ?? existing.name;

  const clash = await prisma.destination.findFirst({
    where: { name: { equals: nextName, mode: 'insensitive' }, id: { not: id } },
  });

  if (clash) {
    throw ApiError.conflict(
      clash.archived
        ? `An archived destination named "${clash.name}" already uses that name. Restore it instead.`
        : `A destination named "${clash.name}" already exists`
    );
  }

  return prisma.$transaction(async (tx) => {
    const { countryName, ...rest } = data;

    const updateData = {
      ...rest,
      aboutDestination: normalizeNullableText(data.aboutDestination),
      packages: normalizeNullableText(data.packages),
      faqs: normalizeNullableText(data.faqs),
    };

    const resolvedCountryId = await resolveCountry(tx, {
      countryId: data.countryId,
      countryName,
    });

    if (resolvedCountryId !== undefined) updateData.countryId = resolvedCountryId;

    // Rebuilt from the merged row, not the patch: an edit that touches only `city` must not blank
    // the haystack for the name it left alone.
    updateData.searchText = searchTextFor({ ...existing, ...updateData });

    return tx.destination.update({ where: { id }, data: updateData });
  });
}

/** Soft delete (locked rule 1) — never a hard delete. */
async function archive(id) {
  const destination = await getById(id);

  if (destination.archived) {
    return { destination, alreadyInState: true };
  }

  const archivedRow = await prisma.destination.update({
    where: { id },
    data: { archived: true },
  });

  return { destination: archivedRow, alreadyInState: false };
}

async function restore(id) {
  const destination = await getById(id);

  if (!destination.archived) {
    return { destination, alreadyInState: true };
  }

  const restored = await prisma.destination.update({
    where: { id },
    data: { archived: false },
  });

  return { destination: restored, alreadyInState: false };
}

module.exports = {
  assertActiveDestination,
  create,
  list,
  getById,
  update,
  archive,
  restore,
};
