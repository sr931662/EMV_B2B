const express = require('express');

const controller = require('../controllers/adminVisaController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { idParamSchema } = require('../utils/visaSchemas');
const { remarksRequiredSchema } = require('../utils/paymentSchemas');
const { uploadSingle, requireFile, PDF_ONLY_EXTENSIONS, PDF_ONLY_MIME_TYPES } = require('../middleware/upload');
const { EVISA_DOCUMENT_UPLOAD_DIR_REL } = require('../services/visaRequestService');

// Mounted at /api/admin/visa-requests — admin-only, same as adminPaymentRoutes.
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.post('/:id/complete', validate(idParamSchema, 'params'), controller.complete);

router.post(
  '/:id/evisa-document',
  validate(idParamSchema, 'params'),
  uploadSingle('document', EVISA_DOCUMENT_UPLOAD_DIR_REL, {
    allowedExtensions: PDF_ONLY_EXTENSIONS,
    allowedMimeTypes: PDF_ONLY_MIME_TYPES,
  }),
  requireFile('document'),
  controller.uploadEvisaDocument
);

// Rejects the whole application — distinct from rejecting one payment (see
// /api/admin/payments/:id/reject, which keeps the application alive).
router.post(
  '/:id/reject-application',
  validate(idParamSchema, 'params'),
  validate(remarksRequiredSchema),
  controller.rejectApplication
);

module.exports = router;
