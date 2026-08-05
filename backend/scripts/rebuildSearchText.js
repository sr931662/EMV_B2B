#!/usr/bin/env node
/**
 * Recomputes the `searchText` haystack for every library entity that has one.
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN A MIGRATION
 * Each migration that adds a searchable field also has to rebuild the haystack for rows already in
 * the table, and doing that in SQL means writing `lower(coalesce(a,'') || ' ' || ...)` a second time
 * — a copy of buildSearchText that nothing keeps in step with the original. The two drift, and the
 * symptom is a search that finds new rows but not old ones, which reads like a caching bug and is
 * hunted for hours.
 *
 * Running this instead uses the real function, so old and new rows are indexed identically by
 * construction. It is idempotent: run it after any change to a `searchFields` list, or any time
 * search results look inconsistent between old and new data.
 *
 *   node scripts/rebuildSearchText.js            # every entity
 *   node scripts/rebuildSearchText.js country    # one entity
 */

const prisma = require('../src/utils/prisma');
const registry = require('../src/services/libraryRegistry');

const BATCH = 500;

async function rebuild(entity) {
  const config = registry.get(entity);

  if (!config?.buildSearch) return { entity, skipped: true, changed: 0 };

  const model = prisma[config.model];
  const idField = config.idField ?? 'id';

  let changed = 0;
  let offset = 0;

  // Paged rather than loaded whole: this runs against production, where the table is not
  // guaranteed to fit comfortably in memory.
  for (;;) {
    const rows = await model.findMany({ take: BATCH, skip: offset, orderBy: { [idField]: 'asc' } });

    if (rows.length === 0) break;

    for (const row of rows) {
      const next = config.buildSearch(row);

      // Only write real differences. An unconditional update would touch `updatedAt` on every row
      // in the catalogue and make the audit trail look like someone edited everything.
      if (next !== row.searchText) {
        await model.update({ where: { [idField]: row[idField] }, data: { searchText: next } });
        changed += 1;
      }
    }

    offset += rows.length;
  }

  return { entity, skipped: false, changed, scanned: offset };
}

(async () => {
  const requested = process.argv.slice(2);
  const entities = requested.length > 0 ? requested : registry.names();

  for (const entity of entities) {
    if (!registry.get(entity)) {
      console.error(`Unknown entity "${entity}". Valid: ${registry.names().join(', ')}`);
      process.exitCode = 1;
      continue;
    }

    const result = await rebuild(entity);

    console.log(
      result.skipped
        ? `${entity.padEnd(14)} skipped (no maintained haystack)`
        : `${entity.padEnd(14)} ${result.changed} of ${result.scanned} rows rebuilt`
    );
  }

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error('rebuildSearchText failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
