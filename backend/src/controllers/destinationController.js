const asyncHandler = require('../utils/asyncHandler');
const destinationService = require('../services/destinationService');
const bulkDataService = require('../services/bulkDataService');

// Thin: bodies/params/query are already validated, thrown errors are rendered globally.

const create = asyncHandler(async (req, res) => {
  const { destination, restored } = await destinationService.create(req.body);

  res.status(restored ? 200 : 201).json({
    message: restored
      ? `Restored previously archived destination "${destination.name}"`
      : 'Destination created',
    restored,
    destination,
  });
});

const list = asyncHandler(async (req, res) => {
  const { includeArchived, countryId, limit, offset } = req.validatedQuery;
  const { destinations, total } = await destinationService.list({ includeArchived, countryId, limit, offset });

  res.status(200).json({ count: destinations.length, total, limit, offset, includeArchived, destinations });
});

const getOne = asyncHandler(async (req, res) => {
  const destination = await destinationService.getById(req.params.id);

  res.status(200).json({ destination });
});

const update = asyncHandler(async (req, res) => {
  const destination = await destinationService.update(req.params.id, req.body);

  res.status(200).json({ message: 'Destination updated', destination });
});

const archive = asyncHandler(async (req, res) => {
  const { destination, alreadyInState } = await destinationService.archive(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Destination was already archived' : 'Destination archived',
    destination,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { destination, alreadyInState } = await destinationService.restore(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Destination was not archived' : 'Destination restored',
    destination,
  });
});

const exportAll = asyncHandler(async (req, res) => {
  const { includeArchived, countryId } = req.query;
  const { buffer, filename } = await bulkDataService.exportDestinations({
    includeArchived: includeArchived === 'true',
    countryId: countryId || undefined,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

const importAll = asyncHandler(async (req, res) => {
  const result = await bulkDataService.importDestinations(req.file.buffer, {
    user: req.user,
    reason: req.body?.reason,
  });

  res.status(200).json({
    message: `${result.created} created, ${result.updated} updated, ${result.skipped} blank row(s) skipped` +
      (result.errors.length ? `, ${result.errors.length} row(s) failed` : ''),
    ...result,
  });
});

module.exports = { create, list, getOne, update, archive, restore, exportAll, importAll };
