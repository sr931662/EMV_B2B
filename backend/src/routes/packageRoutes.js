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

const itineraryController = require('../controllers/itineraryController');
const {
  replaceDayEventsSchema,
  updatePackageDaySchema,
  dayIdParamSchema,
  itineraryQuerySchema,
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

// ---------------------------------------------------------------------------
// Day-wise itinerary
// ---------------------------------------------------------------------------
//
// Reading is open to every role that can see packages — partners need the itinerary to sell the
// trip. Writing is admin-only, like the rest of the package content.
router.get(
  '/:id/itinerary',
  roleMiddleware(...CAN_READ_PACKAGES),
  validate(idParamSchema, 'params'),
  validate(itineraryQuerySchema, 'query'),
  itineraryController.getItinerary
);

// Nested under the DAY, not the package: an event belongs to one day, and routing through the
// package would leave the day id as a body field the route could not validate.
router.get(
  '/days/:dayId/events',
  roleMiddleware(...CAN_READ_PACKAGES),
  validate(dayIdParamSchema, 'params'),
  itineraryController.listDayEvents
);
router.put(
  '/days/:dayId/events',
  roleMiddleware(...CAN_WRITE_PACKAGES),
  validate(dayIdParamSchema, 'params'),
  validate(replaceDayEventsSchema),
  itineraryController.replaceDayEvents
);

// The day's own card — title, brief, description, notes, inclusions, meals — as opposed to its
// events above.
router.patch(
  '/days/:dayId',
  roleMiddleware(...CAN_WRITE_PACKAGES),
  validate(dayIdParamSchema, 'params'),
  validate(updatePackageDaySchema),
  itineraryController.updateDay
);

module.exports = router;
