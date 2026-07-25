const express = require('express');

const controller = require('../controllers/visaDocumentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_VISA_CONFIG, CAN_READ_VISA_CONFIG } = require('../utils/roles');
const {
  countryIdParamSchema,
  countryDocParamSchema,
  createVisaDocumentSchema,
  updateVisaDocumentSchema,
  listVisaDocumentsSchema,
} = require('../utils/visaSchemas');

// Mounted at /api/visa-countries/:countryId/documents — mergeParams so :countryId (matched by
// the parent mount path) is visible to this router's own param validation and handlers.
const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// Read — any authenticated role (the checklist partners need to know what to upload)
router.get(
  '/',
  roleMiddleware(...CAN_READ_VISA_CONFIG),
  validate(countryIdParamSchema, 'params'),
  validate(listVisaDocumentsSchema, 'query'),
  controller.list
);

// Write — admin only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(countryIdParamSchema, 'params'),
  validate(createVisaDocumentSchema),
  controller.create
);
router.patch(
  '/:docId',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(countryDocParamSchema, 'params'),
  validate(updateVisaDocumentSchema),
  controller.update
);
router.delete(
  '/:docId',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(countryDocParamSchema, 'params'),
  controller.archive
);
router.post(
  '/:docId/restore',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(countryDocParamSchema, 'params'),
  controller.restore
);

module.exports = router;
