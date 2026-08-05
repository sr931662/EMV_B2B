const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const dayTemplateService = require('../services/dayTemplateService');
const dayTemplateEventService = require('../services/dayTemplateEventService');
const bulkDataService = require('../services/bulkDataService');

const create = asyncHandler(async (req, res) => {
  const dayTemplate = await dayTemplateService.create(req.body);

  res.status(201).json({ message: 'Day template created', dayTemplate });
});

const list = asyncHandler(async (req, res) => {
  const { destinationId, includeArchived, limit, offset } = req.validatedQuery;
  const { dayTemplates, total } = await dayTemplateService.list({ destinationId, includeArchived, limit, offset });

  res.status(200).json({
    count: dayTemplates.length,
    total,
    limit,
    offset,
    filters: { destinationId: destinationId ?? null, includeArchived },
    dayTemplates,
  });
});

// A direct fetch by id succeeds even when the parent destination is archived (the row is
// hidden from browsing, not gone). destinationArchived is always present so the UI can warn
// rather than having to inspect the nested destination itself.
const getOne = asyncHandler(async (req, res) => {
  const dayTemplate = await dayTemplateService.getById(req.params.id);

  res.status(200).json({ destinationArchived: dayTemplate.destination.archived, dayTemplate });
});

const update = asyncHandler(async (req, res) => {
  const dayTemplate = await dayTemplateService.update(req.params.id, req.body);

  res.status(200).json({ message: 'Day template updated', dayTemplate });
});

const archive = asyncHandler(async (req, res) => {
  const { dayTemplate, alreadyInState } = await dayTemplateService.archive(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Day template was already archived' : 'Day template archived',
    dayTemplate,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { dayTemplate, alreadyInState } = await dayTemplateService.restore(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Day template was not archived' : 'Day template restored',
    dayTemplate,
  });
});

const exportAll = asyncHandler(async (req, res) => {
  const { destinationId, includeArchived } = req.query;
  if (!destinationId) throw ApiError.badRequest('destinationId is required to export day templates');

  const { buffer, filename } = await bulkDataService.exportDayTemplatesForDestination(destinationId, {
    includeArchived: includeArchived === 'true',
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

const importAll = asyncHandler(async (req, res) => {
  const { destinationId } = req.body;
  if (!destinationId) throw ApiError.badRequest('destinationId is required to import day templates');

  const result = await bulkDataService.importDayTemplatesForDestination(destinationId, req.file.buffer, {
    user: req.user,
    reason: req.body?.reason,
  });

  res.status(200).json({
    message: `${result.created} created, ${result.updated} updated, ${result.skipped} blank row(s) skipped` +
      (result.errors.length ? `, ${result.errors.length} row(s) failed` : ''),
    ...result,
  });
});

const listEvents = asyncHandler(async (req, res) => {
  const events = await dayTemplateEventService.list(req.params.id);

  res.status(200).json({ count: events.length, events });
});

const replaceEvents = asyncHandler(async (req, res) => {
  const events = await dayTemplateEventService.replaceAll(req.params.id, req.body.events);

  res.status(200).json({ message: 'Itinerary saved', count: events.length, events });
});

module.exports = {
  create,
  list,
  getOne,
  update,
  archive,
  restore,
  exportAll,
  importAll,
  listEvents,
  replaceEvents,
};
