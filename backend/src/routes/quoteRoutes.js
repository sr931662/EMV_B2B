const express = require('express');

const controller = require('../controllers/quoteController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_QUOTES, CAN_READ_QUOTES, CAN_SUBMIT_PAYMENT } = require('../utils/roles');
const {
  idParamSchema,
  createQuoteSchema,
  updateQuoteSchema,
  listQuotesSchema,
} = require('../utils/quoteSchemas');
const paymentController = require('../controllers/paymentController');
const { submitPaymentSchema } = require('../utils/paymentSchemas');
const { uploadSingle, requireFile } = require('../middleware/upload');
const { PAYMENT_UPLOAD_DIR_REL } = require('../services/paymentService');

const router = express.Router();

router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Read — partner (own only) + admin (all, for the back office)
// Tenancy is enforced per-quote in quoteService.getForUser, not by the role check.
// ---------------------------------------------------------------------------

router.get(
  '/',
  roleMiddleware(...CAN_READ_QUOTES),
  validate(listQuotesSchema, 'query'),
  controller.list
);

// Before '/:id' so the literal segment is not captured by the param route.
// No payment check on this route — locked rule 3.
router.get(
  '/:id/quote.pdf',
  roleMiddleware(...CAN_READ_QUOTES),
  validate(idParamSchema, 'params'),
  controller.downloadQuotePdf
);

router.get(
  '/:id',
  roleMiddleware(...CAN_READ_QUOTES),
  validate(idParamSchema, 'params'),
  controller.getOne
);

// ---------------------------------------------------------------------------
// Write — partner only (a quote is the partner's own document)
// ---------------------------------------------------------------------------

router.post('/', roleMiddleware(...CAN_WRITE_QUOTES), validate(createQuoteSchema), controller.create);

router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_QUOTES),
  validate(idParamSchema, 'params'),
  validate(updateQuoteSchema),
  controller.update
);

router.post(
  '/:id/confirm-customer',
  roleMiddleware(...CAN_WRITE_QUOTES),
  validate(idParamSchema, 'params'),
  controller.confirmCustomer
);

router.delete(
  '/:id',
  roleMiddleware(...CAN_WRITE_QUOTES),
  validate(idParamSchema, 'params'),
  controller.archive
);

// ---------------------------------------------------------------------------
// Payment submission (build step 6) — multipart/form-data, partner only
// ---------------------------------------------------------------------------
//
// Middleware order matters: multer must parse the multipart body before `validate` can see the
// text fields, and the role/param checks run first so an unauthorised request is refused before
// anything is written to disk.
router.post(
  '/:id/payment',
  roleMiddleware(...CAN_SUBMIT_PAYMENT),
  validate(idParamSchema, 'params'),
  uploadSingle('screenshot', PAYMENT_UPLOAD_DIR_REL),
  requireFile('screenshot'),
  validate(submitPaymentSchema),
  paymentController.submitForQuote
);

module.exports = router;
