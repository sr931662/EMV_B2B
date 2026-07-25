const asyncHandler = require('../utils/asyncHandler');
const emailTemplateService = require('../services/emailTemplateService');

const create = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.create(req.body);

  res.status(201).json({ message: 'Email template created', template });
});

const list = asyncHandler(async (req, res) => {
  const { includeArchived } = req.validatedQuery;
  const templates = await emailTemplateService.list({ includeArchived });

  res.status(200).json({ count: templates.length, includeArchived, templates });
});

const getOne = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.getById(req.params.id);

  res.status(200).json({ template });
});

const update = asyncHandler(async (req, res) => {
  const template = await emailTemplateService.update(req.params.id, req.body);

  res.status(200).json({ message: 'Email template updated', template });
});

const archive = asyncHandler(async (req, res) => {
  const { template, alreadyInState } = await emailTemplateService.archive(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Email template was already archived' : 'Email template archived',
    template,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { template, alreadyInState } = await emailTemplateService.restore(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Email template was not archived' : 'Email template restored',
    template,
  });
});

module.exports = { create, list, getOne, update, archive, restore };
