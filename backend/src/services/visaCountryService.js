const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const countryService = require('./countryService');
const { buildSearchText } = require('../utils/searchText');

/**
 * The visa-facing view of a country.
 *
 * There is no VisaCountry table any more — the contract-step migration
 * (20260805170000_visa_country_contract) merged it into `Country` for good. This file survives as a
 * PRESENTATION adapter, not a second data model: every function here reads and writes `Country`
 * rows, and only the shape at the edges is kept looking like the old VisaCountry.
 *
 * That is a deliberate trade, not an oversight. `Country` and `VisaCountry` named the same ideas
 * differently — `heroImageUrl`/`coverImageUrl`, `description`/`aboutCountry`, `travelNotes`/
 * `arrivalInfo` — and visaCountryController, visaProductService, visaRequestService, and the
 * partner-facing marketplace pages (VisaServicesPage, VisaProductDetailPage) were all built against
 * the VisaCountry names. Renaming every one of those call sites in the same change that drops the
 * table would multiply the blast radius of an already-large migration for no reader-facing benefit.
 * The adapter functions below absorb that translation in ONE place, so every consumer keeps working
 * unchanged while the database underneath is a single, honestly-named table.
 */

function toVisaCountryShape(country) {
  if (!country) return country;

  return {
    id: country.id,
    name: country.name,
    shortName: country.shortName,
    coverImageUrl: country.heroImageUrl,
    flagImageUrl: country.flagImageUrl,
    aboutCountry: country.description,
    arrivalInfo: country.travelNotes,
    baseFee: country.baseFee,
    archived: country.archived,
    createdAt: country.createdAt,
    updatedAt: country.updatedAt,
  };
}

function fromVisaCountryShape({ shortName, coverImageUrl, flagImageUrl, aboutCountry, arrivalInfo, baseFee }) {
  const data = {};

  if (shortName !== undefined) data.shortName = shortName;
  if (coverImageUrl !== undefined) data.heroImageUrl = coverImageUrl;
  if (flagImageUrl !== undefined) data.flagImageUrl = flagImageUrl;
  if (aboutCountry !== undefined) data.description = aboutCountry;
  if (arrivalInfo !== undefined) data.travelNotes = arrivalInfo;
  if (baseFee !== undefined) data.baseFee = baseFee;

  return data;
}

/**
 * Guard used by visaRequestService: a visa request may only be created against a country that
 * exists and is not archived. Kept as its own function, rather than a straight call to
 * countryService.assertActiveCountry, because callers need `baseFee` back and the generic guard
 * does not select it.
 */
async function assertActiveVisaCountry(countryId) {
  const country = await prisma.country.findUnique({
    where: { id: countryId },
    select: { id: true, name: true, archived: true, baseFee: true },
  });

  if (!country) {
    throw ApiError.badRequest(`No visa country exists with id ${countryId}`);
  }
  if (country.archived) {
    throw ApiError.badRequest(
      `Visa country "${country.name}" is archived. Restore it before creating new requests for it.`
    );
  }

  return country;
}

/**
 * Create a visa country — really a Country, presented in the old shape.
 *
 * Name matching is case-insensitive. If the match is archived we restore it rather than 409 — same
 * dead-name-lockout reasoning as destinationService.create.
 */
async function create({ name, baseFee = 0, ...rest }) {
  const presentation = fromVisaCountryShape(rest);
  const searchText = buildSearchText(name, presentation.shortName);

  const existing = await prisma.country.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing && !existing.archived) {
    throw ApiError.conflict(`A visa country named "${existing.name}" already exists`);
  }

  if (existing && existing.archived) {
    const restored = await prisma.country.update({
      where: { id: existing.id },
      // Adopt the casing, fee AND presentation the caller just supplied — a "create" that restores
      // an archived row should behave like a fresh create in every visible respect.
      data: { archived: false, name, baseFee, searchText, ...presentation },
    });

    return { country: toVisaCountryShape(restored), restored: true };
  }

  const created = await prisma.country.create({
    data: {
      name,
      baseFee,
      searchText,
      slug: await countryService.uniqueSlug(prisma, name),
      ...presentation,
    },
  });

  return { country: toVisaCountryShape(created), restored: false };
}

async function list({ includeArchived = false, limit = 50, offset = 0 } = {}) {
  const where = includeArchived ? {} : { archived: false };

  const [rows, total] = await Promise.all([
    prisma.country.findMany({ where, orderBy: { name: 'asc' }, take: limit, skip: offset }),
    prisma.country.count({ where }),
  ]);

  return { countries: rows.map(toVisaCountryShape), total, limit, offset };
}

/** Returns archived rows too — an admin has to be able to inspect one before restoring it. */
async function getById(id) {
  const country = await prisma.country.findUnique({ where: { id } });

  if (!country) throw ApiError.notFound(`No visa country exists with id ${id}`);

  return toVisaCountryShape(country);
}

async function update(id, { name, baseFee, ...rest }) {
  const existing = await prisma.country.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`No visa country exists with id ${id}`);

  // name is optional here (a baseFee-only edit sends no name) — only run the uniqueness check
  // when a name was actually supplied. `equals: undefined` would make Prisma ignore the
  // condition entirely, matching ANY other row and reporting a false clash.
  if (name !== undefined) {
    const clash = await prisma.country.findFirst({
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

  const presentation = fromVisaCountryShape(rest);

  const data = { ...presentation };
  if (name !== undefined) data.name = name;
  if (baseFee !== undefined) data.baseFee = baseFee;

  // Rebuilt from the merged row, not the patch: an edit touching only the fee must not blank the
  // haystack for the name it left alone.
  data.searchText = buildSearchText(
    data.name ?? existing.name,
    'shortName' in data ? data.shortName : existing.shortName
  );

  const updated = await prisma.country.update({ where: { id }, data });

  return toVisaCountryShape(updated);
}

/** Soft delete (locked rule 1). Does not cascade to required documents or in-flight requests. */
async function archive(id) {
  const country = await getById(id);

  if (country.archived) return { country, alreadyInState: true };

  const archivedRow = await prisma.country.update({ where: { id }, data: { archived: true } });

  return { country: toVisaCountryShape(archivedRow), alreadyInState: false };
}

async function restore(id) {
  const country = await getById(id);

  if (!country.archived) return { country, alreadyInState: true };

  const restored = await prisma.country.update({ where: { id }, data: { archived: false } });

  return { country: toVisaCountryShape(restored), alreadyInState: false };
}

module.exports = { assertActiveVisaCountry, create, list, getById, update, archive, restore };
