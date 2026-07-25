const express = require('express');

const controller = require('../controllers/hotelController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_WRITE_LIBRARY, CAN_READ_LIBRARY } = require('../utils/roles');
const {
  idParamSchema,
  createHotelSchema,
  updateHotelSchema,
  listHotelsSchema,
} = require('../utils/librarySchemas');

const router = express.Router();

router.use(authMiddleware);

// Read — any authenticated role. ?destinationId= powers the package builder's dependent dropdown.
router.get(
  '/',
  roleMiddleware(...CAN_READ_LIBRARY),
  validate(listHotelsSchema, 'query'),
  controller.list
);
router.get(
  '/:id',
  roleMiddleware(...CAN_READ_LIBRARY),
  validate(idParamSchema, 'params'),
  controller.getOne
);

// Write — admin + data_feeder only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(createHotelSchema),
  controller.create
);
router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(idParamSchema, 'params'),
  validate(updateHotelSchema),
  controller.update
);
router.delete(
  '/:id',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(idParamSchema, 'params'),
  controller.archive
);
router.post(
  '/:id/restore',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(idParamSchema, 'params'),
  controller.restore
);

module.exports = router;
