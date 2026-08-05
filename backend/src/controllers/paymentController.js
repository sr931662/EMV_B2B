const fs = require('fs');
const path = require('path');

const asyncHandler = require('../utils/asyncHandler');
const paymentService = require('../services/paymentService');

// ---------------------------------------------------------------------------
// Partner
// ---------------------------------------------------------------------------

const submitForQuote = asyncHandler(async (req, res) => {
  const { payment, reconciliationMismatch, expectedAmount, message } =
    await paymentService.submitForQuote(req.params.id, req.body, req.file, req.user);

  res.status(201).json({
    message,
    reconciliation: {
      amountPaid: payment.amount,
      expectedAmount,
      reconciliationMismatch,
      note: reconciliationMismatch
        ? 'Amount differs from the wholesale amount owed to TravNexa — flagged for review. (This is not the quote total shown to your customer — it excludes your markup.)'
        : 'Amount matches the wholesale amount owed to TravNexa.',
    },
    payment: {
      id: payment.id,
      type: payment.type,
      status: payment.status,
      transactionId: payment.transactionId,
      amount: payment.amount,
      submittedAt: payment.createdAt,
    },
    quoteStatus: payment.quote.status,
  });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const listQueue = asyncHandler(async (req, res) => {
  const filters = req.validatedQuery;
  const { payments, total, limit, offset } = await paymentService.listForAdmin(filters);

  res.status(200).json({
    count: payments.length,
    total,
    limit,
    offset,
    filters: { status: filters.status ?? 'PENDING_VERIFICATION', ...filters },
    payments,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const payment = await paymentService.getByIdForAdmin(req.params.id);

  res.status(200).json({
    payment,
    summary: paymentService.toQueueRow(payment),
    screenshotUrl: `/api/admin/payments/${payment.id}/screenshot`,
  });
});

const downloadScreenshot = asyncHandler(async (req, res) => {
  const { absolutePath, contentType, payment } = await paymentService.getScreenshotPath(
    req.params.id
  );

  const fileName = `payment-proof-${payment.transactionId}${path.extname(absolutePath)}`.replace(
    /[^\w.\-]/g,
    '_'
  );

  res.setHeader('Content-Type', contentType);
  // Always an attachment: this is partner-uploaded content and must never be rendered inline
  // in the admin's browser context.
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', fs.statSync(absolutePath).size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  fs.createReadStream(absolutePath).pipe(res);
});

const approve = asyncHandler(async (req, res) => {
  const payment = await paymentService.approve(req.params.id, req.body.adminRemarks, req.user);

  res.status(200).json({
    message: 'Payment approved — booking confirmed',
    paymentStatus: payment.status,
    quoteStatus: payment.quote?.status ?? null,
    verifiedBy: payment.verifiedBy?.email ?? null,
    verifiedAt: payment.verifiedAt,
    payment,
  });
});

const reject = asyncHandler(async (req, res) => {
  const payment = await paymentService.reject(req.params.id, req.body.adminRemarks, req.user);

  res.status(200).json({
    message: 'Payment rejected — quote returned to CUSTOMER_APPROVED so the partner can resubmit',
    paymentStatus: payment.status,
    quoteStatus: payment.quote?.status ?? null,
    adminRemarks: payment.adminRemarks,
    payment,
  });
});

const requestInfo = asyncHandler(async (req, res) => {
  const payment = await paymentService.requestInfo(req.params.id, req.body.adminRemarks, req.user);

  res.status(200).json({
    message: 'More information requested from the partner',
    paymentStatus: payment.status,
    quoteStatus: payment.quote?.status ?? null,
    adminRemarks: payment.adminRemarks,
    payment,
  });
});

module.exports = {
  submitForQuote,
  listQueue,
  getOne,
  downloadScreenshot,
  approve,
  reject,
  requestInfo,
};
