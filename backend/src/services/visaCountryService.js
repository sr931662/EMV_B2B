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
    select: { id: true, name: true, archived: true },
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
async function create({ name }) {
  const existing = await prisma.visaCountry.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing && !existing.archived) {
    throw ApiError.conflict(`A visa country named "${existing.name}" already exists`);
  }

  if (existing && existing.archived) {
    const restored = await prisma.visaCountry.update({
      where: { id: existing.id },
      data: { archived: false, name }, // adopt the casing the caller just supplied
    });

    return { country: restored, restored: true };
  }

  const created = await prisma.visaCountry.create({ data: { name } });

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

async function update(id, { name }) {
  await getById(id); // 404 if missing

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

  return prisma.visaCountry.update({ where: { id }, data: { name } });
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
