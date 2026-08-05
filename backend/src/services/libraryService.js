const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const auditService = require('./auditService');
const registry = require('./libraryRegistry');
const { normaliseQuery } = require('../utils/searchText');

/**
 * One implementation of list, search, read, write, archive and usage for every library entity.
 *
 * The alternative — a service per entity — is how the current Library ended up as fifteen
 * inconsistent CRUD screens. Everything specific to an entity lives in libraryRegistry.js; this
 * file holds only what is genuinely the same for all of them.
 */

function configFor(entity) {
  const config = registry.get(entity);

  if (!config) {
    throw ApiError.badRequest(
      `Unknown library entity "${entity}". Valid values: ${registry.names().join(', ')}`
    );
  }

  return config;
}

/** Most entities key on `id`; Currency keys on its ISO code. */
function idWhere(config, id) {
  return { [config.idField ?? 'id']: id };
}

/**
 * Refuses generic writes to entities that own their editing elsewhere.
 *
 * A visa product is a checklist and a set of timelines; a day template is a sequence of events. A
 * generic name-and-description form would let someone save either one into a state its own screen
 * cannot represent. VisaCountry is refused for a sharper reason: its writes carry the Phase 3
 * dual-write into Country, and a generic update here would leave the mirror stale.
 */
function assertWritable(config, entity) {
  if (!config.readOnly) return;

  throw ApiError.badRequest(
    `${config.label} cannot be edited from the master-data browser — it has its own screen. ` +
      `Browsing, usage and history for "${entity}" are available here.`
  );
}

/**
 * Some entities must not be written straight to Prisma.
 *
 * A visa product's name has to be unique WITHIN its country and carries the Phase 3 countryId; a
 * visa country's write mirrors into Country. Those rules live in their own services, and a generic
 * `prisma[model].create` walks past every one of them — silently, which is the worst version.
 *
 * So the registry may name a service to delegate to. The generic layer keeps everything that is
 * genuinely generic — the field whitelist, the permission strip, the audit entry — and hands only
 * the write itself over.
 *
 * `require` is deliberately lazy. These services require this one back (libraryService is used for
 * usage counts), and resolving at module load would be a cycle.
 */
async function writeThrough(config, action, ...callArgs) {
  if (!config.writeThrough) return null;

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const service = require(config.writeThrough.module);

  return config.writeThrough[action](service, ...callArgs);
}

/**
 * Picker search.
 *
 * Matches against the maintained `searchText` column so the trigram index is used. Entities with no
 * haystack (small, fixed lists) fall back to a name prefix match, which is fine at their size and
 * avoids a table scan pretending to be a search.
 */
async function search(entity, { q, scopeId, type, limit = 20 } = {}) {
  const config = configFor(entity);
  const model = prisma[config.model];

  const where = { archived: false };

  if (config.requiredFilter === 'type') {
    if (!type) throw ApiError.badRequest(`${entity} search requires a "type"`);
    where.type = type;
  }

  if (scopeId && config.scopeField) where[config.scopeField] = scopeId;

  const term = normaliseQuery(q);

  if (term) {
    where.OR = config.buildSearch
      ? [{ searchText: { contains: term } }]
      : config.searchFields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' } }));
  }

  const rows = await model.findMany({
    where,
    orderBy: config.defaultOrder,
    take: Math.min(limit, 50),
  });

  return rows.map(config.toOption);
}

/** Browsing list for the admin shell — the full row, not the picker projection. */
async function list(entity, { includeArchived = false, scopeId, type, q, limit = 100, offset = 0 } = {}) {
  const config = configFor(entity);
  const model = prisma[config.model];

  const where = {};

  if (!includeArchived) where.archived = false;
  if (scopeId && config.scopeField) where[config.scopeField] = scopeId;
  if (type && config.requiredFilter === 'type') where.type = type;

  const term = normaliseQuery(q);

  if (term) {
    where.OR = config.buildSearch
      ? [{ searchText: { contains: term } }]
      : config.searchFields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' } }));
  }

  const [rows, total] = await Promise.all([
    model.findMany({ where, orderBy: config.defaultOrder, take: Math.min(limit, 200), skip: offset }),
    model.count({ where }),
  ]);

  return { rows, total, limit, offset };
}

async function getById(entity, id) {
  const config = configFor(entity);
  const row = await prisma[config.model].findUnique({ where: idWhere(config, id) });

  if (!row) throw ApiError.notFound(`No ${config.label.toLowerCase()} exists with id ${id}`);

  return row;
}

/**
 * Creates, keeping searchText and the audit trail in step.
 *
 * Both happen inside one transaction with the write itself: a row whose haystack was never built is
 * invisible to every picker, and an audit entry committed apart from its change is not evidence.
 */
async function create(entity, payload, { user, reason, ip } = {}) {
  const config = configFor(entity);

  assertWritable(config, entity);

  const { data: known, ignored } = registry.stripUnknownFields(entity, payload, { isCreate: true });
  const { data, stripped } = registry.stripForbiddenFields(entity, known, user);

  if (config.buildSearch) data.searchText = config.buildSearch(data);

  // Delegated writes run OUTSIDE this transaction, because the service opens its own. The audit
  // entry then follows separately — a slightly weaker guarantee than the generic path, and stated
  // rather than hidden: the alternative is a nested transaction, which Prisma does not support.
  if (config.writeThrough) {
    const row = await writeThrough(config, 'create', data);

    await auditService.record(prisma, {
      entityType: config.entityType,
      entityId: row[config.idField ?? 'id'],
      action: 'CREATE',
      after: row,
      actor: user,
      reason,
      ip,
    });

    return { row, strippedFields: stripped, ignoredFields: ignored };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx[config.model].create({ data });

    await auditService.record(tx, {
      entityType: config.entityType,
      entityId: row[config.idField ?? 'id'],
      action: 'CREATE',
      after: row,
      actor: user,
      reason,
      ip,
    });

    return row;
  });

  return { row: created, strippedFields: stripped, ignoredFields: ignored };
}

async function update(entity, id, payload, { user, reason, ip } = {}) {
  const config = configFor(entity);

  assertWritable(config, entity);

  const before = await getById(entity, id);
  const { data: known, ignored } = registry.stripUnknownFields(entity, payload);
  const { data, stripped } = registry.stripForbiddenFields(entity, known, user);

  // Rebuilt from the merged row, not from the patch: a partial update that touches one searchable
  // field must not blank the haystack for the ones it left alone.
  if (config.buildSearch) data.searchText = config.buildSearch({ ...before, ...data });

  if (config.writeThrough) {
    const row = await writeThrough(config, 'update', id, data);

    await auditService.record(prisma, {
      entityType: config.entityType,
      entityId: id,
      action: 'UPDATE',
      before,
      after: row,
      actor: user,
      reason,
      ip,
    });

    return { row, strippedFields: stripped, ignoredFields: ignored };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx[config.model].update({ where: idWhere(config, id), data });

    await auditService.record(tx, {
      entityType: config.entityType,
      entityId: id,
      action: 'UPDATE',
      before,
      after: row,
      actor: user,
      reason,
      ip,
    });

    return row;
  });

  return { row: updated, strippedFields: stripped, ignoredFields: ignored };
}

/**
 * Everything that points at this row.
 *
 * Answers the question the admin shell asks before letting anyone archive: what breaks. Counts come
 * from EntityLink plus the entity's own known dependants, because a link table cannot see a plain
 * foreign key.
 */
async function usage(entity, id) {
  const config = configFor(entity);

  const links = await prisma.entityLink.groupBy({
    by: ['ownerType'],
    where: { itemType: config.entityType, itemId: id, archived: false },
    _count: true,
  });

  const direct = [];

  // Foreign-key dependants, declared per entity because only the schema knows them.
  if (entity === 'destination') {
    const [packages, hotels, dayTemplates] = await Promise.all([
      prisma.package.count({ where: { destinationId: id, archived: false } }),
      prisma.hotel.count({ where: { destinationId: id, archived: false } }),
      prisma.dayTemplate.count({ where: { destinationId: id, archived: false } }),
    ]);
    if (packages) direct.push({ type: 'Package', count: packages });
    if (hotels) direct.push({ type: 'Hotel', count: hotels });
    if (dayTemplates) direct.push({ type: 'DayTemplate', count: dayTemplates });
  }

  if (entity === 'country') {
    // Country absorbed VisaCountry at the contract step, so its usage now covers both what it
    // always covered (destinations, visa products) and what VisaCountry's own usage check used to
    // report (visa requests) — one entity, one usage answer.
    const [destinations, visaProducts, visaRequests] = await Promise.all([
      prisma.destination.count({ where: { countryId: id, archived: false } }),
      prisma.visaProduct.count({ where: { countryId: id, archived: false } }),
      prisma.visaRequest.count({ where: { countryId: id, archived: false } }),
    ]);
    if (destinations) direct.push({ type: 'Destination', count: destinations });
    if (visaProducts) direct.push({ type: 'VisaProduct', count: visaProducts });
    if (visaRequests) direct.push({ type: 'VisaRequest', count: visaRequests });
  }

  if (entity === 'documentType') {
    const requirements = await prisma.visaRequiredDocument.count({
      where: { documentTypeId: id, archived: false },
    });
    if (requirements) direct.push({ type: 'VisaRequiredDocument', count: requirements });
  }

  if (entity === 'cancellationPolicy') {
    const [packages, tiers] = await Promise.all([
      prisma.package.count({ where: { cancellationPolicyId: id, archived: false } }),
      prisma.cancellationTier.count({ where: { policyId: id, archived: false } }),
    ]);
    if (packages) direct.push({ type: 'Package', count: packages });
    // Tiers belong TO the policy rather than depending on it, so they are reported but must not
    // block an archive — a policy that cannot be withdrawn because it has bands is nonsense.
    if (tiers) direct.push({ type: 'CancellationTier', count: tiers, owned: true });
  }

  if (entity === 'insurancePlan') {
    const sold = await prisma.quoteInsurance.count({ where: { insurancePlanId: id, archived: false } });
    if (sold) direct.push({ type: 'QuoteInsurance', count: sold });
  }

  if (entity === 'vendor') {
    const [contracts, hotelRates, activityRates] = await Promise.all([
      prisma.hotelVendor.count({ where: { vendorId: id, archived: false } }),
      prisma.hotelRate.count({ where: { vendorId: id, archived: false } }),
      prisma.activityRate.count({ where: { vendorId: id, archived: false } }),
    ]);
    if (contracts) direct.push({ type: 'HotelVendor', count: contracts });
    if (hotelRates) direct.push({ type: 'HotelRate', count: hotelRates });
    if (activityRates) direct.push({ type: 'ActivityRate', count: activityRates });
  }

  if (entity === 'activity') {
    const [rates, events] = await Promise.all([
      prisma.activityRate.count({ where: { activityId: id, archived: false } }),
      prisma.dayTemplateEvent.count({ where: { activityId: id, archived: false } }),
    ]);
    // Rates belong TO the activity; templates depend on it.
    if (rates) direct.push({ type: 'ActivityRate', count: rates, owned: true });
    if (events) direct.push({ type: 'DayTemplateEvent', count: events });
  }

  if (entity === 'hotel') {
    const [contracts, rates] = await Promise.all([
      prisma.hotelVendor.count({ where: { hotelId: id, archived: false } }),
      prisma.hotelRate.count({ where: { hotelId: id, archived: false } }),
    ]);
    // Both belong to the hotel — a hotel that cannot be withdrawn because it has rates is nonsense.
    if (contracts) direct.push({ type: 'HotelVendor', count: contracts, owned: true });
    if (rates) direct.push({ type: 'HotelRate', count: rates, owned: true });
  }

  const references = [
    ...direct,
    ...links.map((l) => ({ type: l.ownerType, count: l._count })),
  ];

  return {
    references,
    // Rows the entity OWNS are shown but do not count as dependants — otherwise a cancellation
    // policy could never be archived because it has the bands that make it a policy.
    total: references.filter((r) => !r.owned).reduce((sum, r) => sum + r.count, 0),
  };
}

/**
 * Archive, refusing while anything still points at the row.
 *
 * Safe to refuse only because quotes snapshot at generation (Phase 1): an issued quote already
 * holds its own copy, so this check protects DRAFT work rather than history. Without the snapshot
 * boundary this would have to allow the archive and hope.
 */
async function archive(entity, id, { user, reason, ip, force = false } = {}) {
  const config = configFor(entity);
  const before = await getById(entity, id);

  if (before.archived) return { row: before, alreadyInState: true };

  const { references, total } = await usage(entity, id);

  if (total > 0 && !force) {
    const summary = references.map((r) => `${r.count} ${r.type}`).join(', ');

    throw ApiError.conflict(
      `Cannot archive: still referenced by ${summary}. Detach it first, or archive with force ` +
        'if it should be withdrawn anyway.'
    );
  }

  const row = await prisma.$transaction(async (tx) => {
    const archived = await tx[config.model].update({
      where: idWhere(config, id),
      data: { archived: true },
    });

    // Links go with the row, in the same transaction. A live link to an archived item is the
    // orphan this design's polymorphic ids cannot prevent at the database level.
    await tx.entityLink.updateMany({
      where: { itemType: config.entityType, itemId: id, archived: false },
      data: { archived: true },
    });

    await auditService.record(tx, {
      entityType: config.entityType,
      entityId: id,
      action: 'ARCHIVE',
      before,
      after: archived,
      actor: user,
      reason,
      ip,
    });

    return archived;
  });

  return { row, alreadyInState: false };
}

async function restore(entity, id, { user, reason, ip } = {}) {
  const config = configFor(entity);
  const before = await getById(entity, id);

  if (!before.archived) return { row: before, alreadyInState: true };

  const row = await prisma.$transaction(async (tx) => {
    const restored = await tx[config.model].update({
      where: idWhere(config, id),
      data: { archived: false },
    });

    await auditService.record(tx, {
      entityType: config.entityType,
      entityId: id,
      action: 'RESTORE',
      before,
      after: restored,
      actor: user,
      reason,
      ip,
    });

    return restored;
  });

  // Links are deliberately NOT un-archived: an owner may have detached this while it was gone, and
  // silently reattaching would resurrect a relationship someone removed on purpose.
  return { row, alreadyInState: false };
}

/**
 * Permanently removes an archived row — the one real exception to locked rule 1 (soft-delete
 * everywhere), and deliberately the narrowest possible one: allowed ONLY on a row that is already
 * archived (a deliberate, prior decision to withdraw it) AND currently unreferenced by anything
 * `usage()` knows to check. Archive protects draft work from an accidental click; this exists for
 * the row that turns out to be pure junk — a duplicate typed twice, a test entry — where keeping
 * it archived forever just accumulates clutter nobody will ever restore.
 *
 * Still recorded in the audit trail (action DELETE, `after: null`) even though the row itself is
 * gone — AuditLog.entityId is a plain string, not a foreign key, so the history survives its
 * subject exactly the way it is meant to for an archived-then-restored row.
 */
async function hardDelete(entity, id, { user, reason, ip } = {}) {
  const config = configFor(entity);
  const before = await getById(entity, id);

  if (!before.archived) {
    throw ApiError.badRequest('Archive it first — only an already-archived row can be permanently deleted.');
  }

  const { references, total } = await usage(entity, id);

  if (total > 0) {
    const summary = references.map((r) => `${r.count} ${r.type}`).join(', ');
    throw ApiError.conflict(`Cannot delete: still referenced by ${summary}. Detach it first.`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Nothing meaningful to preserve in a link once the row it points at no longer exists.
      await tx.entityLink.deleteMany({
        where: {
          OR: [
            { itemType: config.entityType, itemId: id },
            { ownerType: config.entityType, ownerId: id },
          ],
        },
      });

      await tx[config.model].delete({ where: idWhere(config, id) });

      await auditService.record(tx, {
        entityType: config.entityType,
        entityId: id,
        action: 'DELETE',
        before,
        after: null,
        actor: user,
        reason,
        ip,
      });
    });
  } catch (err) {
    // The usage() check above covers every dependency this registry knows to look for, but the
    // database's own onDelete: Restrict is the real backstop — a relation added to the schema
    // without a matching usage() entry would otherwise fail with a raw constraint error instead
    // of the clean message above.
    //
    // Two different shapes reach here for the same underlying reason: Prisma raises its own
    // PrismaClientKnownRequestError (code P2003) when IT catches the missing relation first, but
    // when Postgres's RESTRICT trigger is what actually fires — the case that matters here, since
    // every one of this registry's relations is exactly that — it comes back as a
    // PrismaClientUnknownRequestError with no `.code` at all, just Postgres's own message text
    // buried in `.message`. Matching on the message is the only way to catch that one.
    const isForeignKeyRestrict =
      err.code === 'P2003' || /violates RESTRICT setting of foreign key constraint/i.test(err.message ?? '');

    if (isForeignKeyRestrict) {
      throw ApiError.conflict(
        'Cannot delete: still referenced by something this check does not know about. Nothing was changed.'
      );
    }
    throw err;
  }

  return { deleted: true };
}

module.exports = { search, list, getById, create, update, usage, archive, restore, hardDelete, configFor };
