const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const destinationService = require('./destinationService');

// The intern's itinerary-day library. These rows are the SOURCE only — when a package is
// built (step 4) their content is COPIED into PackageDay with no FK back here (locked
// rule 2). Nothing in this file knows anything about packages.

const DESTINATION_SUMMARY = { select: { id: true, name: true, archived: true } };

async function create({ destinationId, title, description }) {
  await destinationService.assertActiveDestination(destinationId); // 400 if missing/archived

  return prisma.dayTemplate.create({
    data: { destinationId, title, description },
    include: { destination: DESTINATION_SUMMARY },
  });
}

/**
 * ?destinationId= is the exact query the package builder will call to populate its
 * dependent dropdown, so it must stay a clean indexed filter on destinationId + archived.
 *
 * Parent visibility is Option B (read-time filter, see PROJECT_SPEC.md): a template whose
 * destination is archived is hidden from default lists even though its own archived flag is
 * still false. Archiving a destination never mutates its children, so restoring the
 * destination brings them all back exactly as they were.
 */
async function list({ destinationId, includeArchived = false, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (destinationId) where.destinationId = destinationId;

  if (!includeArchived) {
    where.archived = false;
    where.destination = { is: { archived: false } };
  }

  const [dayTemplates, total] = await Promise.all([
    prisma.dayTemplate.findMany({
      where,
      orderBy: { title: 'asc' },
      include: { destination: DESTINATION_SUMMARY },
      take: limit,
      skip: offset,
    }),
    prisma.dayTemplate.count({ where }),
  ]);

  return { dayTemplates, total, limit, offset };
}

/**
 * Returns archived rows too, so an admin can inspect one before restoring it — and returns
 * rows under an archived destination as well. Fetching a known id is a deliberate act, not
 * browsing, so it is not subject to the parent-visibility filter above. The controller
 * surfaces `destinationArchived` so the UI can warn instead of silently showing a hidden row.
 */
async function getById(id) {
  const dayTemplate = await prisma.dayTemplate.findUnique({
    where: { id },
    include: { destination: DESTINATION_SUMMARY },
  });

  if (!dayTemplate) throw ApiError.notFound(`No day template exists with id ${id}`);

  return dayTemplate;
}

/** Only title/description are updatable — a template does not move between destinations. */
async function update(id, data) {
  await getById(id);

  return prisma.dayTemplate.update({
    where: { id },
    data,
    include: { destination: DESTINATION_SUMMARY },
  });
}

/** Soft delete (locked rule 1). */
async function archive(id) {
  const dayTemplate = await getById(id);

  if (dayTemplate.archived) return { dayTemplate, alreadyInState: true };

  const archivedRow = await prisma.dayTemplate.update({
    where: { id },
    data: { archived: true },
    include: { destination: DESTINATION_SUMMARY },
  });

  return { dayTemplate: archivedRow, alreadyInState: false };
}

/**
 * Restoring under an archived destination is refused, for the same reason creating one
 * there is refused — it would produce an active library entry the package builder could
 * offer under a destination that is supposed to be gone.
 */
async function restore(id) {
  const dayTemplate = await getById(id);

  if (!dayTemplate.archived) return { dayTemplate, alreadyInState: true };

  await destinationService.assertActiveDestination(dayTemplate.destinationId);

  const restored = await prisma.dayTemplate.update({
    where: { id },
    data: { archived: false },
    include: { destination: DESTINATION_SUMMARY },
  });

  return { dayTemplate: restored, alreadyInState: false };
}

module.exports = { create, list, getById, update, archive, restore };
