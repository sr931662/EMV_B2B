const asyncHandler = require('../utils/asyncHandler');
const dayTemplateService = require('../services/dayTemplateService');

const create = asyncHandler(async (req, res) => {
  const dayTemplate = await dayTemplateService.create(req.body);

  res.status(201).json({ message: 'Day template created', dayTemplate });
});

const list = asyncHandler(async (req, res) => {
  const { destinationId, includeArchived } = req.validatedQuery;
  const dayTemplates = await dayTemplateService.list({ destinationId, includeArchived });

  res.status(200).json({
    count: dayTemplates.length,
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

module.exports = { create, list, getOne, update, archive, restore };
