const express = require('express');

const controller = require('../controllers/visaProductController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_VISA_CONFIG, CAN_READ_VISA_CONFIG } = require('../utils/roles');
const {
  idParamSchema,
  createVisaProductSchema,
  updateVisaProductSchema,
  listVisaProductsSchema,
} = require('../utils/visaSchemas');

const router = express.Router();

router.use(authMiddleware);

// Read — any authenticated role. This is the marketplace endpoint the partner-facing
// Visa Products page filters against.
router.get(
  '/',
  roleMiddleware(...CAN_READ_VISA_CONFIG),
  validate(listVisaProductsSchema, 'query'),
  controller.list
);
router.get(
  '/:id',
  roleMiddleware(...CAN_READ_VISA_CONFIG),
  validate(idParamSchema, 'params'),
  validate(listVisaProductsSchema, 'query'),
  controller.getOne
);

// Write — admin only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(createVisaProductSchema),
  controller.create
);
router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(idParamSchema, 'params'),
  validate(updateVisaProductSchema),
  controller.update
);
router.delete(
  '/:id',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(idParamSchema, 'params'),
  controller.archive
);
router.post(
  '/:id/restore',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(idParamSchema, 'params'),
  controller.restore
);

module.exports = router;
