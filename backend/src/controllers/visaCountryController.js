const asyncHandler = require('../utils/asyncHandler');
const visaCountryService = require('../services/visaCountryService');

const create = asyncHandler(async (req, res) => {
  const { country, restored } = await visaCountryService.create(req.body);

  res.status(restored ? 200 : 201).json({
    message: restored
      ? `Restored previously archived visa country "${country.name}"`
      : 'Visa country created',
    restored,
    country,
  });
});

const list = asyncHandler(async (req, res) => {
  const { includeArchived, limit, offset } = req.validatedQuery;
  const { countries, total } = await visaCountryService.list({ includeArchived, limit, offset });

  res.status(200).json({ count: countries.length, total, limit, offset, includeArchived, countries });
});

const getOne = asyncHandler(async (req, res) => {
  const country = await visaCountryService.getById(req.params.id);

  res.status(200).json({ country });
});

const update = asyncHandler(async (req, res) => {
  const country = await visaCountryService.update(req.params.id, req.body);

  res.status(200).json({ message: 'Visa country updated', country });
});

const archive = asyncHandler(async (req, res) => {
  const { country, alreadyInState } = await visaCountryService.archive(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Visa country was already archived' : 'Visa country archived',
    country,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { country, alreadyInState } = await visaCountryService.restore(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Visa country was not archived' : 'Visa country restored',
    country,
  });
});

module.exports = { create, list, getOne, update, archive, restore };
