const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const hotelService = require('../services/hotelService');
const bulkDataService = require('../services/bulkDataService');

const create = asyncHandler(async (req, res) => {
  const hotel = await hotelService.create(req.body);

  res.status(201).json({ message: 'Hotel created', hotel });
});

const list = asyncHandler(async (req, res) => {
  const { destinationId, includeArchived, limit, offset } = req.validatedQuery;
  const { hotels, total } = await hotelService.list({ destinationId, includeArchived, limit, offset });

  res.status(200).json({
    count: hotels.length,
    total,
    limit,
    offset,
    filters: { destinationId: destinationId ?? null, includeArchived },
    hotels,
  });
});

// A direct fetch by id succeeds even when the parent destination is archived (the row is
// hidden from browsing, not gone). destinationArchived is always present so the UI can warn
// rather than having to inspect the nested destination itself.
const getOne = asyncHandler(async (req, res) => {
  const hotel = await hotelService.getById(req.params.id);

  res.status(200).json({ destinationArchived: hotel.destination.archived, hotel });
});

const update = asyncHandler(async (req, res) => {
  const hotel = await hotelService.update(req.params.id, req.body);

  res.status(200).json({ message: 'Hotel updated', hotel });
});

const archive = asyncHandler(async (req, res) => {
  const { hotel, alreadyInState } = await hotelService.archive(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Hotel was already archived' : 'Hotel archived',
    hotel,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { hotel, alreadyInState } = await hotelService.restore(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Hotel was not archived' : 'Hotel restored',
    hotel,
  });
});

const exportAll = asyncHandler(async (req, res) => {
  const { destinationId, includeArchived } = req.query;
  if (!destinationId) throw ApiError.badRequest('destinationId is required to export hotels');

  const { buffer, filename } = await bulkDataService.exportHotelsForDestination(destinationId, {
    includeArchived: includeArchived === 'true',
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

const importAll = asyncHandler(async (req, res) => {
  const { destinationId } = req.body;
  if (!destinationId) throw ApiError.badRequest('destinationId is required to import hotels');

  const result = await bulkDataService.importHotelsForDestination(destinationId, req.file.buffer, {
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
