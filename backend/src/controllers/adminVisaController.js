const asyncHandler = require('../utils/asyncHandler');
const visaRequestService = require('../services/visaRequestService');

/** Admin-only: marks a visa application as finished once processing has started. */
const complete = asyncHandler(async (req, res) => {
  const visaRequest = await visaRequestService.complete(req.params.id, req.user);

  res.status(200).json({ message: 'Visa request marked completed', visaRequest });
});

/**
 * Admin-only: rejects the WHOLE application outright (distinct from rejecting one payment —
 * see paymentService.reject, which keeps the application alive at APPLICATION_SUBMITTED).
 */
const rejectApplication = asyncHandler(async (req, res) => {
  const visaRequest = await visaRequestService.rejectApplication(
    req.params.id,
    req.body.adminRemarks,
    req.user
  );

  res.status(200).json({ message: 'Visa application rejected', visaRequest });
});

module.exports = { complete, rejectApplication };
