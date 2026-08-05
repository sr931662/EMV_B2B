const fs = require('fs');
const path = require('path');

const asyncHandler = require('../utils/asyncHandler');
const visaRequestService = require('../services/visaRequestService');
const paymentService = require('../services/paymentService');

const create = asyncHandler(async (req, res) => {
  const visaRequest = await visaRequestService.create(req.body, req.user);

  res.status(201).json({
    message: 'Visa request created',
    applicationNumber: visaRequest.applicationNumber,
    visaRequest,
  });
});

const list = asyncHandler(async (req, res) => {
  const { requests: visaRequests, total, limit, offset } = await visaRequestService.list(
    req.validatedQuery,
    req.user
  );

  res.status(200).json({
    count: visaRequests.length,
    total,
    limit,
    offset,
    scope: req.user.role === 'admin' ? 'all partners' : 'own requests only',
    visaRequests,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const visaRequest = await visaRequestService.getById(req.params.id, req.user);

  res.status(200).json({ visaRequest });
});

const update = asyncHandler(async (req, res) => {
  const visaRequest = await visaRequestService.update(req.params.id, req.body, req.user);

  res.status(200).json({ message: 'Visa request updated', visaRequest });
});

const archive = asyncHandler(async (req, res) => {
  const { visaRequest, alreadyInState } = await visaRequestService.archive(req.params.id, req.user);

  res.status(200).json({
    message: alreadyInState ? 'Visa request was already archived' : 'Visa request archived',
    visaRequest,
  });
});

/** Multipart: one file, `documentName` matched against the country's live checklist. */
const uploadDocument = asyncHandler(async (req, res) => {
  const visaRequest = await visaRequestService.uploadDocument(
    req.params.id,
    req.params.passengerId,
    req.body.documentName,
    req.file,
    req.user
  );

  res.status(201).json({ message: 'Document uploaded', visaRequest });
});

const downloadDocumentFile = asyncHandler(async (req, res) => {
  const { absolutePath, contentType, upload, passengerName } = await visaRequestService.getDocumentFile(
    req.params.id,
    req.params.passengerId,
    req.params.uploadId,
    req.user
  );

  const slug = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'document';
  const fileName = `${slug(passengerName)}-${slug(upload.documentName)}${path.extname(absolutePath)}`;

  res.setHeader('Content-Type', contentType);
  // Always an attachment: partner-uploaded content must never render inline in a browser tab.
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', fs.statSync(absolutePath).size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  fs.createReadStream(absolutePath).pipe(res);
});

const downloadEvisaDocumentFile = asyncHandler(async (req, res) => {
  const { absolutePath, visaRequest } = await visaRequestService.getEvisaDocumentFile(
    req.params.id,
    req.user
  );

  const slug = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'evisa';
  const fileName = `${slug(visaRequest.applicationNumber)}-evisa.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', fs.statSync(absolutePath).size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  fs.createReadStream(absolutePath).pipe(res);
});

/**
 * Visa payment submission. Mirrors paymentController's quote-payment route exactly, reusing
 * paymentService's shared upload/verification machinery from build step 6 (locked rule 6) —
 * including, now that VisaRequest carries its own sellingPrice, the same reconciliation block.
 */
const submitPayment = asyncHandler(async (req, res) => {
  const { payment, reconciliationMismatch, expectedAmount, message } =
    await paymentService.submitForVisaRequest(req.params.id, req.body, req.file, req.user);

  res.status(201).json({
    message,
    reconciliation: {
      amountPaid: payment.amount,
      expectedAmount,
      reconciliationMismatch,
      note: reconciliationMismatch
        ? 'Amount differs from the wholesale amount owed to TravNexa — flagged for review. (This is not the total shown to your customer — it excludes your markup.)'
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
    visaRequestStatus: payment.visaRequest?.status ?? null,
  });
});

module.exports = {
  create,
  list,
  getOne,
  update,
  archive,
  uploadDocument,
  downloadDocumentFile,
  downloadEvisaDocumentFile,
  submitPayment,
};
