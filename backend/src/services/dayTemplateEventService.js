const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * The scheduled events inside one day template — the day-by-day content the template exists to
 * hold. `dayTemplateService` only ever touches title/description (see its own comment: "Events are
 * the substance of a day template and need their own builder"); this file is that builder.
 *
 * Same archive-and-replace shape as `dayEventService.js` (a package's own itinerary-day events),
 * on purpose: an admin building a day reorders items, nests one under another and retimes several
 * before saving once, and `packageService.copyEvent()` already assumes the two models are
 * field-for-field siblings when it copies one into the other at package-build time. The one real
 * difference is `activityId` — a REAL library reference here, since a template is the library, not
 * a frozen copy of it; a package's own day events keep no such link (locked rule 2).
 */

async function assertTemplate(dayTemplateId) {
  const template = await prisma.dayTemplate.findUnique({
    where: { id: dayTemplateId },
    select: { id: true, title: true, archived: true, destination: { select: { archived: true } } },
  });

  if (!template) throw ApiError.notFound(`No day template exists with id ${dayTemplateId}`);
  if (template.archived) {
    throw ApiError.badRequest(`Day template "${template.title}" is archived. Restore it before editing its events.`);
  }
  if (template.destination.archived) {
    throw ApiError.badRequest(
      `The destination for "${template.title}" is archived. Restore it before editing this template's events.`
    );
  }

  return template;
}

const SUB_EVENTS_INCLUDE = {
  subEvents: {
    where: { archived: false },
    orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
  },
};

async function list(dayTemplateId) {
  await assertTemplate(dayTemplateId);

  return prisma.dayTemplateEvent.findMany({
    where: { dayTemplateId, archived: false, parentEventId: null },
    orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
    include: SUB_EVENTS_INCLUDE,
  });
}

/**
 * Replaces every event on a template.
 *
 * sortOrder comes from array position at each level, so reordering in the UI is just a reordered
 * array. Parents are inserted first so their generated ids are available to their children, which
 * is why this cannot be a single createMany.
 */
async function replaceAll(dayTemplateId, events) {
  await assertTemplate(dayTemplateId);

  return prisma.$transaction(async (tx) => {
    await tx.dayTemplateEvent.updateMany({
      where: { dayTemplateId, archived: false },
      data: { archived: true },
    });

    for (const [index, event] of events.entries()) {
      const { subEvents = [], ...parentData } = event;

      const created = await tx.dayTemplateEvent.create({
        data: { ...parentData, dayTemplateId, sortOrder: index },
      });

      if (subEvents.length > 0) {
        await tx.dayTemplateEvent.createMany({
          data: subEvents.map((sub, subIndex) => ({
            ...sub,
            dayTemplateId,
            parentEventId: created.id,
            sortOrder: subIndex,
          })),
        });
      }
    }

    return tx.dayTemplateEvent.findMany({
      where: { dayTemplateId, archived: false, parentEventId: null },
      orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
      include: SUB_EVENTS_INCLUDE,
    });
  });
}

module.exports = { list, replaceAll };
