const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { buildSearchText } = require('../utils/searchText');

/**
 * Country — the single row for a country.
 *
 * Used to be two tables: `Country` and `VisaCountry`, kept in sync by a one-directional mirror
 * (`mirrorVisaCountry`) during the expand phase that started at Phase 3. The contract-step migration
 * (20260805170000_visa_country_contract) dropped `VisaCountry` and repointed every foreign key that
 * referenced it — `VisaProduct.countryId`, `VisaRequest.countryId` — at `Country` directly. The
 * mirror function is gone with it: there is only one table to write to now.
 */

/** Slug used in URLs. Same rule as the Phase 3 migration's pg_temp.country_slug. */
function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function searchTextFor(row) {
  return buildSearchText(row.name, row.shortName, row.isoAlpha2, row.isoAlpha3);
}

/**
 * Slug that does not collide.
 *
 * Country.slug is UNIQUE and two different names can normalise to the same slug ("Cote d'Ivoire",
 * "Cote-d-Ivoire"). Suffixing beats failing the write: a slug is a URL convenience, not something
 * worth rejecting a country over.
 */
async function uniqueSlug(client, name, ignoreId) {
  const base = slugify(name) || 'country';

  const taken = await client.country.findFirst({
    where: { slug: base, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });

  if (!taken) return base;

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Finds the country a destination belongs to, creating it if this is the first time it is named.
 *
 * Used when a destination is created with a country NAME rather than an id — which is what the
 * existing destination form sends, and what a CSV import will send too. Creating on first mention
 * is the behaviour that stops people leaving the field blank, which is the outcome that actually
 * breaks the hierarchy.
 */
async function findOrCreateByName(client, name) {
  const trimmed = String(name ?? '').trim();

  if (!trimmed) throw ApiError.badRequest('A country name is required');

  const existing = await client.country.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  });

  if (existing) return existing;

  return client.country.create({
    data: {
      name: trimmed,
      slug: await uniqueSlug(client, trimmed),
      searchText: searchTextFor({ name: trimmed }),
    },
  });
}

/** Guard mirroring destinationService.assertActiveDestination. */
async function assertActiveCountry(countryId) {
  const country = await prisma.country.findUnique({
    where: { id: countryId },
    select: { id: true, name: true, archived: true, currencyCode: true },
  });

  if (!country) throw ApiError.badRequest(`No country exists with id ${countryId}`);

  if (country.archived) {
    throw ApiError.badRequest(
      `Country "${country.name}" is archived. Restore it before assigning anything to it.`
    );
  }

  return country;
}

module.exports = {
  slugify,
  searchTextFor,
  uniqueSlug,
  findOrCreateByName,
  assertActiveCountry,
};
