const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const registry = require('./libraryRegistry');
const auditService = require('./auditService');

/**
 * Attaching library items to things, through EntityLink.
 *
 * The same FAQ belongs on a country, a destination, a package and a visa product. A foreign key per
 * owner would mean altering the FAQ table every time something new wants FAQs, and five nullable
 * columns of which exactly one is ever set. EntityLink carries the pair instead.
 *
 * WHAT THIS COSTS, STATED PLAINLY: a polymorphic id has no referential integrity. The database
 * cannot stop a link pointing at a row that no longer exists, which is exactly what
 * `libraryService.archive` compensates for by archiving an item's links in the same transaction.
 * Everything read through here is filtered against the live item, so an orphan is invisible rather
 * than broken — but it is a trade, not a free lunch.
 */

/**
 * Owners that may carry attachments.
 *
 * A whitelist rather than "any string", because ownerType is written by callers and a typo would
 * create a link set nothing ever reads again — invisible, permanent, and impossible to notice.
 */
const OWNER_TYPES = new Set([
  'Country',
  'Destination',
  'Package',
  'VisaProduct',
  'Hotel',
  'Quote',
]);

/**
 * Roles distinguish several link sets on one owner.
 *
 * A package has inclusions AND exclusions, both pointing at LookupItem rows; without a role they
 * would be one undifferentiated list.
 */
const ROLES = new Set([
  'default',
  'faq',
  'note',
  'inclusion',
  'exclusion',
  'amenity',
  'document',
  'gallery',
]);

function assertOwner(ownerType) {
  if (!OWNER_TYPES.has(ownerType)) {
    throw ApiError.badRequest(
      `"${ownerType}" cannot carry attachments. Valid owners: ${[...OWNER_TYPES].join(', ')}`
    );
  }
}

function assertRole(role) {
  if (!ROLES.has(role)) {
    throw ApiError.badRequest(`Unknown attachment role "${role}". Valid: ${[...ROLES].join(', ')}`);
  }
}

/**
 * Attaches library items to an owner, in the order given.
 *
 * Replaces the whole set for that (owner, role) rather than appending. Ordering is the reason: FAQs
 * and notes are printed in sequence, and an "add one" API leaves the caller to manage sortOrder,
 * which is how two items end up sharing position 3.
 */
async function setLinks(entity, ownerType, ownerId, itemIds, { user, reason, ip, role = 'default' } = {}) {
  const config = registry.get(entity);

  if (!config) throw ApiError.badRequest(`Unknown library entity "${entity}"`);

  assertOwner(ownerType);
  assertRole(role);

  // Every id must exist and be live. Attaching an archived FAQ would put it back in front of
  // customers through a side door that never touches the archive check.
  const live = await prisma[config.model].findMany({
    where: { [config.idField ?? 'id']: { in: itemIds }, archived: false },
    select: { [config.idField ?? 'id']: true },
  });

  const liveIds = new Set(live.map((row) => row[config.idField ?? 'id']));
  const missing = itemIds.filter((id) => !liveIds.has(id));

  if (missing.length > 0) {
    throw ApiError.badRequest(
      `These ${config.label.toLowerCase()} entries do not exist or are archived: ${missing.join(', ')}`
    );
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.entityLink.findMany({
      where: { ownerType, ownerId, role, itemType: config.entityType, archived: false },
      orderBy: { sortOrder: 'asc' },
    });

    await tx.entityLink.updateMany({
      where: { ownerType, ownerId, role, itemType: config.entityType, archived: false },
      data: { archived: true },
    });

    // Upsert rather than create: the unique key survives archiving, so re-attaching something that
    // was detached earlier would otherwise collide.
    for (const [index, itemId] of itemIds.entries()) {
      await tx.entityLink.upsert({
        where: {
          itemType_itemId_ownerType_ownerId_role: {
            itemType: config.entityType,
            itemId,
            ownerType,
            ownerId,
            role,
          },
        },
        create: {
          itemType: config.entityType,
          itemId,
          ownerType,
          ownerId,
          role,
          sortOrder: index,
        },
        update: { archived: false, sortOrder: index },
      });
    }

    // Recorded against the OWNER, not the items: "what changed on this package" is the question
    // someone asks, and a trail of six FaqItem entries would not answer it.
    await auditService.record(tx, {
      entityType: ownerType,
      entityId: ownerId,
      action: 'UPDATE',
      before: { [`${role}:${config.entityType}`]: before.map((l) => l.itemId) },
      after: { [`${role}:${config.entityType}`]: itemIds },
      actor: user,
      reason,
      ip,
    });

    return tx.entityLink.findMany({
      where: { ownerType, ownerId, role, itemType: config.entityType, archived: false },
      orderBy: { sortOrder: 'asc' },
    });
  });
}

/**
 * The live items attached to an owner, in order.
 *
 * Two queries rather than a join, because EntityLink has no real foreign key to join through. The
 * second one also filters out anything archived since it was attached, which is what keeps an
 * orphaned link invisible instead of broken.
 */
async function getLinked(entity, ownerType, ownerId, { role = 'default' } = {}) {
  const config = registry.get(entity);

  if (!config) throw ApiError.badRequest(`Unknown library entity "${entity}"`);

  const links = await prisma.entityLink.findMany({
    where: { ownerType, ownerId, role, itemType: config.entityType, archived: false },
    orderBy: { sortOrder: 'asc' },
  });

  if (links.length === 0) return [];

  const rows = await prisma[config.model].findMany({
    where: { [config.idField ?? 'id']: { in: links.map((l) => l.itemId) }, archived: false },
  });

  const byId = new Map(rows.map((row) => [row[config.idField ?? 'id'], row]));

  // Link order wins, not database order — these are printed in sequence.
  return links.map((link) => byId.get(link.itemId)).filter(Boolean);
}

/** Everything attached to an owner, grouped by role. Used to assemble a package or a country page. */
async function getAllForOwner(ownerType, ownerId) {
  assertOwner(ownerType);

  const links = await prisma.entityLink.findMany({
    where: { ownerType, ownerId, archived: false },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
  });

  const grouped = {};

  for (const link of links) {
    const entity = registry.names().find((name) => registry.get(name).entityType === link.itemType);

    if (!entity) continue; // a link to an entity type no longer registered

    grouped[link.role] ??= {};
    grouped[link.role][entity] ??= [];
    grouped[link.role][entity].push(link.itemId);
  }

  // Resolved per (role, entity) so each list keeps its own ordering.
  const resolved = {};

  for (const [role, byEntity] of Object.entries(grouped)) {
    resolved[role] = {};

    for (const entity of Object.keys(byEntity)) {
      resolved[role][entity] = await getLinked(entity, ownerType, ownerId, { role });
    }
  }

  return resolved;
}

module.exports = { OWNER_TYPES, ROLES, setLinks, getLinked, getAllForOwner };
