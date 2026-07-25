const express = require('express');

const controller = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { CAN_VERIFY_PAYMENT } = require('../utils/roles');
const {
  idParamSchema,
  approvePaymentSchema,
  remarksRequiredSchema,
  listPaymentsSchema,
} = require('../utils/paymentSchemas');

const router = express.Router();

// Every route here is admin-only — applied once at the router so no individual route can be
// added later without inheriting it.
router.use(authMiddleware);
router.use(roleMiddleware(...CAN_VERIFY_PAYMENT));

router.get('/', validate(listPaymentsSchema, 'query'), controller.listQueue);

// Before '/:id' so the literal segment wins.
router.get('/:id/screenshot', validate(idParamSchema, 'params'), controller.downloadScreenshot);

router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

router.post(
  '/:id/approve',
  validate(idParamSchema, 'params'),
  validate(approvePaymentSchema),
  controller.approve
);

// adminRemarks is mandatory on both of these — the partner must be told what to fix.
router.post(
  '/:id/reject',
  validate(idParamSchema, 'params'),
  validate(remarksRequiredSchema),
  controller.reject
);

router.post(
  '/:id/request-info',
  validate(idParamSchema, 'params'),
  validate(remarksRequiredSchema),
  controller.requestInfo
);

module.exports = router;
