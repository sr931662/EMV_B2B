const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * The scheduled events on one itinerary day.
 *
 * Saved as a whole day at a time rather than row by row: an admin building a day reorders items,
 * nests one under another and retimes three of them before saving once. Per-row endpoints would
 * turn that into a dozen round trips and leave the day half-edited if one failed.
 *
 * Archive-and-replace, matching the pattern used for package days and visa checklists (locked
 * rule 1): superseded rows are archived, never deleted, so anything that referenced them still
 * has intact history behind it.
 */

async function assertDay(packageDayId) {
  const day = await prisma.packageDay.findUnique({
    where: { id: packageDayId },
    select: { id: true, archived: true, package: { select: { archived: true, title: true } } },
  });

  if (!day) throw ApiError.notFound(`No itinerary day exists with id ${packageDayId}`);
  if (day.archived) throw ApiError.badRequest('That itinerary day is archived. Restore it before editing.');
  if (day.package.archived) {
    throw ApiError.badRequest(
      `Package "${day.package.title}" is archived. Restore it before editing its itinerary.`
    );
  }

  return day;
}

async function list(packageDayId) {
  await assertDay(packageDayId);

  return prisma.packageDayEvent.findMany({
    where: { packageDayId, archived: false, parentEventId: null },
    orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
    include: {
      subEvents: {
        where: { archived: false },
        orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
      },
    },
  });
}

/**
 * Replaces every event on a day.
 *
 * sortOrder comes from array position at each level, so reordering in the UI is just a reordered
 * array — there are no index numbers for the client to keep in sync. Parents are inserted first so
 * their generated ids are available to their children; that ordering is why this cannot be a
 * single createMany.
 */
async function replaceAll(packageDayId, events) {
  await assertDay(packageDayId);

  return prisma.$transaction(async (tx) => {
    await tx.packageDayEvent.updateMany({
      where: { packageDayId, archived: false },
      data: { archived: true },
    });

    for (const [index, event] of events.entries()) {
      const { subEvents = [], ...parentData } = event;

      const created = await tx.packageDayEvent.create({
        data: { ...parentData, packageDayId, sortOrder: index },
      });

      if (subEvents.length > 0) {
        await tx.packageDayEvent.createMany({
          data: subEvents.map((sub, subIndex) => ({
            ...sub,
            packageDayId,
            parentEventId: created.id,
            sortOrder: subIndex,
          })),
        });
      }
    }

    return tx.packageDayEvent.findMany({
      where: { packageDayId, archived: false, parentEventId: null },
      orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
      include: {
        subEvents: {
          where: { archived: false },
          orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
        },
      },
    });
  });
}

module.exports = { list, replaceAll };
