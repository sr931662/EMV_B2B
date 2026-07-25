const express = require('express');

const controller = require('../controllers/packageController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_PACKAGES, CAN_READ_PACKAGES } = require('../utils/roles');
const {
  idParamSchema,
  createPackageSchema,
  updatePackageSchema,
  listPackagesSchema,
} = require('../utils/packageSchemas');

const router = express.Router();

router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Read — any authenticated role (partners browse the marketplace)
// ---------------------------------------------------------------------------

router.get(
  '/',
  roleMiddleware(...CAN_READ_PACKAGES),
  validate(listPackagesSchema, 'query'),
  controller.list
);

// Declared before '/:id' so the literal segment is not swallowed by the param route.
// No payment check anywhere on this route — locked rule 3.
router.get(
  '/:id/emv-quote.pdf',
  roleMiddleware(...CAN_READ_PACKAGES),
  validate(idParamSchema, 'params'),
  controller.downloadEmvQuote
);

router.get(
  '/:id',
  roleMiddleware(...CAN_READ_PACKAGES),
  validate(idParamSchema, 'params'),
  controller.getOne
);

// ---------------------------------------------------------------------------
// Write — admin only
// ---------------------------------------------------------------------------

router.post(
  '/',
  roleMiddleware(...CAN_WRITE_PACKAGES),
  validate(createPackageSchema),
  controller.create
);
router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_PACKAGES),
  validate(idParamSchema, 'params'),
  validate(updatePackageSchema),
  controller.update
);
router.delete(
  '/:id',
  roleMiddleware(...CAN_WRITE_PACKAGES),
  validate(idParamSchema, 'params'),
  controller.archive
);
router.post(
  '/:id/restore',
  roleMiddleware(...CAN_WRITE_PACKAGES),
  validate(idParamSchema, 'params'),
  controller.restore
);

module.exports = router;
