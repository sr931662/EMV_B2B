const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * Guard used by visaRequestService: a visa request may only be created against a country that
 * exists and is not archived. Lives here because this service owns the VisaCountry model —
 * mirrors destinationService.assertActiveDestination.
 */
async function assertActiveVisaCountry(visaCountryId) {
  const country = await prisma.visaCountry.findUnique({
    where: { id: visaCountryId },
    select: { id: true, name: true, archived: true, baseFee: true },
  });

  if (!country) {
    throw ApiError.badRequest(`No visa country exists with id ${visaCountryId}`);
  }
  if (country.archived) {
    throw ApiError.badRequest(
      `Visa country "${country.name}" is archived. Restore it before creating new requests for it.`
    );
  }

  return country;
}

/**
 * Create a visa country.
 *
 * Name matching is case-insensitive. If the match is archived we restore it rather than 409 —
 * same dead-name-lockout reasoning as destinationService.create.
 */
async function create({ name, baseFee = 0 }) {
  const existing = await prisma.visaCountry.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing && !existing.archived) {
    throw ApiError.conflict(`A visa country named "${existing.name}" already exists`);
  }

  if (existing && existing.archived) {
    const restored = await prisma.visaCountry.update({
      where: { id: existing.id },
      // Adopt the casing AND fee the caller just supplied — a "create" that restores an
      // archived row should behave like a fresh create in every visible respect.
      data: { archived: false, name, baseFee },
    });

    return { country: restored, restored: true };
  }

  const created = await prisma.visaCountry.create({ data: { name, baseFee } });

  return { country: created, restored: false };
}

async function list({ includeArchived = false } = {}) {
  return prisma.visaCountry.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { name: 'asc' },
  });
}

/** Returns archived rows too — an admin has to be able to inspect one before restoring it. */
async function getById(id) {
  const country = await prisma.visaCountry.findUnique({ where: { id } });

  if (!country) throw ApiError.notFound(`No visa country exists with id ${id}`);

  return country;
}

async function update(id, { name, baseFee }) {
  await getById(id); // 404 if missing

  // name is optional here (a baseFee-only edit sends no name) — only run the uniqueness check
  // when a name was actually supplied. `equals: undefined` would make Prisma ignore the
  // condition entirely, matching ANY other row and reporting a false clash.
  if (name !== undefined) {
    const clash = await prisma.visaCountry.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
    });

    if (clash) {
      throw ApiError.conflict(
        clash.archived
          ? `An archived visa country named "${clash.name}" already uses that name. Restore it instead.`
          : `A visa country named "${clash.name}" already exists`
      );
    }
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (baseFee !== undefined) data.baseFee = baseFee;

  return prisma.visaCountry.update({ where: { id }, data });
}

/** Soft delete (locked rule 1). Does not cascade to required documents or in-flight requests. */
async function archive(id) {
  const country = await getById(id);

  if (country.archived) return { country, alreadyInState: true };

  const archivedRow = await prisma.visaCountry.update({ where: { id }, data: { archived: true } });

  return { country: archivedRow, alreadyInState: false };
}

async function restore(id) {
  const country = await getById(id);

  if (!country.archived) return { country, alreadyInState: true };

  const restored = await prisma.visaCountry.update({ where: { id }, data: { archived: false } });

  return { country: restored, alreadyInState: false };
}

module.exports = { assertActiveVisaCountry, create, list, getById, update, archive, restore };
