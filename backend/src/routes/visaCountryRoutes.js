const express = require('express');

const controller = require('../controllers/visaCountryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_VISA_CONFIG, CAN_READ_VISA_CONFIG } = require('../utils/roles');
const {
  idParamSchema,
  createVisaCountrySchema,
  updateVisaCountrySchema,
  listVisaCountriesSchema,
} = require('../utils/visaSchemas');

const router = express.Router();

router.use(authMiddleware);

// Read — any authenticated role
router.get(
  '/',
  roleMiddleware(...CAN_READ_VISA_CONFIG),
  validate(listVisaCountriesSchema, 'query'),
  controller.list
);
router.get(
  '/:id',
  roleMiddleware(...CAN_READ_VISA_CONFIG),
  validate(idParamSchema, 'params'),
  controller.getOne
);

// Write — admin only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(createVisaCountrySchema),
  controller.create
);
router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_VISA_CONFIG),
  validate(idParamSchema, 'params'),
  validate(updateVisaCountrySchema),
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
