const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/dashboardService');

const get = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getForPartner(req.user);

  res.status(200).json(dashboard);
});

module.exports = { get };
