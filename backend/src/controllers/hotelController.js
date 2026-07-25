const asyncHandler = require('../utils/asyncHandler');
const hotelService = require('../services/hotelService');

const create = asyncHandler(async (req, res) => {
  const hotel = await hotelService.create(req.body);

  res.status(201).json({ message: 'Hotel created', hotel });
});

const list = asyncHandler(async (req, res) => {
  const { destinationId, includeArchived } = req.validatedQuery;
  const hotels = await hotelService.list({ destinationId, includeArchived });

  res.status(200).json({
    count: hotels.length,
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

module.exports = { create, list, getOne, update, archive, restore };
