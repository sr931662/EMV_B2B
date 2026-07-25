const express = require('express');

const controller = require('../controllers/visaRequestController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_VISA_REQUESTS, CAN_READ_VISA_REQUESTS, CAN_SUBMIT_PAYMENT } = require('../utils/roles');
const {
  idParamSchema,
  createVisaRequestSchema,
  updateVisaRequestSchema,
  listVisaRequestsSchema,
  requestPassengerParamSchema,
  requestPassengerUploadParamSchema,
  uploadVisaDocumentSchema,
} = require('../utils/visaSchemas');
const { submitPaymentSchema } = require('../utils/paymentSchemas');
const { uploadSingle, requireFile } = require('../middleware/upload');
const { PAYMENT_UPLOAD_DIR_REL } = require('../services/paymentService');
const { VISA_DOCUMENT_UPLOAD_DIR_REL } = require('../services/visaRequestService');

const router = express.Router();

router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Read — partner (own only, enforced in visaRequestService.getForUser) + admin (all)
// ---------------------------------------------------------------------------

router.get(
  '/',
  roleMiddleware(...CAN_READ_VISA_REQUESTS),
  validate(listVisaRequestsSchema, 'query'),
  controller.list
);

// Before '/:id' so the literal segment is not swallowed by the param route.
router.get(
  '/:id/passengers/:passengerId/documents/:uploadId/file',
  roleMiddleware(...CAN_READ_VISA_REQUESTS),
  validate(requestPassengerUploadParamSchema, 'params'),
  controller.downloadDocumentFile
);

router.get(
  '/:id',
  roleMiddleware(...CAN_READ_VISA_REQUESTS),
  validate(idParamSchema, 'params'),
  controller.getOne
);

// ---------------------------------------------------------------------------
// Write — partner only (a visa request is the partner's own application)
// ---------------------------------------------------------------------------

router.post(
  '/',
  roleMiddleware(...CAN_WRITE_VISA_REQUESTS),
  validate(createVisaRequestSchema),
  controller.create
);

router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_VISA_REQUESTS),
  validate(idParamSchema, 'params'),
  validate(updateVisaRequestSchema),
  controller.update
);

router.delete(
  '/:id',
  roleMiddleware(...CAN_WRITE_VISA_REQUESTS),
  validate(idParamSchema, 'params'),
  controller.archive
);

// Per-passenger document upload (multipart) — reuses the step-6 upload middleware verbatim.
router.post(
  '/:id/passengers/:passengerId/documents',
  roleMiddleware(...CAN_WRITE_VISA_REQUESTS),
  validate(requestPassengerParamSchema, 'params'),
  uploadSingle('document', VISA_DOCUMENT_UPLOAD_DIR_REL),
  requireFile('document'),
  validate(uploadVisaDocumentSchema),
  controller.uploadDocument
);

// Payment submission (multipart) — reuses step-6's paymentService/upload machinery exactly.
router.post(
  '/:id/payment',
  roleMiddleware(...CAN_SUBMIT_PAYMENT),
  validate(idParamSchema, 'params'),
  uploadSingle('screenshot', PAYMENT_UPLOAD_DIR_REL),
  requireFile('screenshot'),
  validate(submitPaymentSchema),
  controller.submitPayment
);

module.exports = router;
