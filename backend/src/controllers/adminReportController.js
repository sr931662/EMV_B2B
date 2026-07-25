const asyncHandler = require('../utils/asyncHandler');
const reportService = require('../services/reportService');

const summary = asyncHandler(async (req, res) => {
  const report = await reportService.getSummary(req.validatedQuery);

  res.status(200).json(report);
});

module.exports = { summary };
