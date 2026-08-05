/**
 * Builds the lower-cased haystack that backs the trigram indexes.
 *
 * WHY A MAINTAINED COLUMN
 * The alternatives are an expression index (which cannot span several columns without repeating the
 * expression in every query) or a database trigger (which would put a business rule — "what is a
 * hotel searchable by" — somewhere no developer reading the service would find it). The application
 * already owns every write path, so it owns this too.
 *
 * Kept deliberately in step with the backfill in the Phase 2 migration: same fields, same
 * lower/trim. If a field is added here, the migration is the record of what the old rows contain.
 */

/** Joins the parts a person might actually type, dropping empties, lower-cased for the index. */
function buildSearchText(...parts) {
  return parts
    .flat()
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
    .map((part) => String(part).trim())
    .join(' ')
    .toLowerCase();
}

/**
 * Normalises a user's query the same way.
 *
 * Both sides must be lower-cased or the trigram comparison is doing extra work for nothing — and a
 * caller who forgets would get results that look randomly case-sensitive.
 */
function normaliseQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

module.exports = { buildSearchText, normaliseQuery };
