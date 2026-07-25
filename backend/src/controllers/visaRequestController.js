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
  const visaRequests = await visaRequestService.list(req.validatedQuery, req.user);

  res.status(200).json({
    count: visaRequests.length,
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

  res.status(200).json({ message: 'Passengers updated', visaRequest });
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

/**
 * Visa payment submission. Mirrors packageController's quote-payment route exactly, reusing
 * paymentService's shared upload/verification machinery from build step 6 (locked rule 6).
 */
const submitPayment = asyncHandler(async (req, res) => {
  const { payment, message } = await paymentService.submitForVisaRequest(
    req.params.id,
    req.body,
    req.file,
    req.user
  );

  res.status(201).json({
    message,
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
  submitPayment,
};
