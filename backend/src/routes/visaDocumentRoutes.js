const express = require('express');

const controller = require('../controllers/visaDocumentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_VISA_CONFIG, CAN_READ_VISA_CONFIG } = require('../utils/roles');
const {
  productIdParamSchema,
  productDocParamSchema,
  createVisaDocumentSchema,
  updateVisaDocumentSchema,
  listVisaDocumentsSchema,
} = require('../utils/visaSchemas');

// Mounted at /api/visa-products/:productId/documents — mergeParams so :productId (matched by
// the parent mount path) is visible to this router's own param validation and handlers.
// Product-scoped, not country-scoped: an eVisa and a sticker visa for the same country ask for
// different paperwork.
const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// Read — any authenticated role (the checklist partners need to know what to upload)
router.get(
  '/',
  roleMiddleware(...CAN_READ_VISA_CONFIG),
  validate(productIdParamSchema, 'params'),
  validate(listVisaDocumentsSchema, 'query'),
  controller.list
);

// Write — admin only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(productIdParamSchema, 'params'),
  validate(createVisaDocumentSchema),
  controller.create
);
router.patch(
  '/:docId',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(productDocParamSchema, 'params'),
  validate(updateVisaDocumentSchema),
  controller.update
);
router.delete(
  '/:docId',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(productDocParamSchema, 'params'),
  controller.archive
);
router.post(
  '/:docId/restore',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(productDocParamSchema, 'params'),
  controller.restore
);

module.exports = router;
