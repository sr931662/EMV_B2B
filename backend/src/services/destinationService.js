const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

function normalizeNullableText(value) {
  if (value === undefined) return undefined;
  return value ? value : null;
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
async function create({ name, aboutDestination, packages, faqs }) {
  const existing = await prisma.destination.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing && !existing.archived) {
    throw ApiError.conflict(`A destination named "${existing.name}" already exists`);
  }

  if (existing && existing.archived) {
    const restored = await prisma.destination.update({
      where: { id: existing.id },
      data: {
        archived: false,
        name,
        aboutDestination:
          normalizeNullableText(aboutDestination) ?? existing.aboutDestination,
        packages: normalizeNullableText(packages) ?? existing.packages,
        faqs: normalizeNullableText(faqs) ?? existing.faqs,
      }, // adopt the casing the caller just supplied
    });

    return { destination: restored, restored: true };
  }

  const created = await prisma.destination.create({
    data: {
      name,
      aboutDestination: normalizeNullableText(aboutDestination) ?? null,
      packages: normalizeNullableText(packages) ?? null,
      faqs: normalizeNullableText(faqs) ?? null,
    },
  });

  return { destination: created, restored: false };
}

async function list({ includeArchived = false } = {}) {
  return prisma.destination.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { name: 'asc' },
  });
}

/** Returns archived rows too — an admin has to be able to look at one before restoring it. */
async function getById(id) {
  const destination = await prisma.destination.findUnique({ where: { id } });

  if (!destination) throw ApiError.notFound(`No destination exists with id ${id}`);

  return destination;
}

async function update(id, data) {
  const existing = await getById(id); // 404 if missing

  const nextName = data.name ?? existing.name;
  const updateData = {
    ...data,
    aboutDestination: normalizeNullableText(data.aboutDestination),
    packages: normalizeNullableText(data.packages),
    faqs: normalizeNullableText(data.faqs),
  };

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

  return prisma.destination.update({ where: { id }, data: updateData });
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
