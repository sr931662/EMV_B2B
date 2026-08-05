const asyncHandler = require('../utils/asyncHandler');
const adminAgencyService = require('../services/adminAgencyService');

const list = asyncHandler(async (req, res) => {
  const { agencies, total, limit, offset } = await adminAgencyService.list(req.validatedQuery);

  res.status(200).json({ count: agencies.length, total, limit, offset, filters: req.validatedQuery, agencies });
});

const getOne = asyncHandler(async (req, res) => {
  const agency = await adminAgencyService.getById(req.params.id);

  res.status(200).json({ agency });
});

const suspend = asyncHandler(async (req, res) => {
  const agency = await adminAgencyService.suspend(req.params.id);

  res.status(200).json({ message: 'Agency suspended — sessions revoked', agency });
});

const activate = asyncHandler(async (req, res) => {
  const agency = await adminAgencyService.activate(req.params.id);

  res.status(200).json({ message: 'Agency activated', agency });
});

module.exports = { list, getOne, suspend, activate };
