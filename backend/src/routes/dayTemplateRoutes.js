const express = require('express');

const controller = require('../controllers/dayTemplateController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { uploadSpreadsheet, requireFile } = require('../middleware/upload');
const { CAN_WRITE_LIBRARY, CAN_READ_LIBRARY } = require('../utils/roles');
const {
  idParamSchema,
  createDayTemplateSchema,
  updateDayTemplateSchema,
  listDayTemplatesSchema,
  replaceDayTemplateEventsSchema,
} = require('../utils/librarySchemas');

const router = express.Router();

router.use(authMiddleware);

// Read — any authenticated role. ?destinationId= powers the package builder's dependent dropdown.
router.get(
  '/',
  roleMiddleware(...CAN_READ_LIBRARY),
  validate(listDayTemplatesSchema, 'query'),
  controller.list
);

// Excel bulk import/export, scoped to one destination. Registered before '/:id' so the literal
// segment wins.
router.get('/export', roleMiddleware(...CAN_READ_LIBRARY), controller.exportAll);
router.post(
  '/import',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  uploadSpreadsheet('file'),
  requireFile('file'),
  controller.importAll
);

router.get(
  '/:id',
  roleMiddleware(...CAN_READ_LIBRARY),
  validate(idParamSchema, 'params'),
  controller.getOne
);

// The day-by-day events inside one template — its actual content. Saved as a whole day (all
// events at once), same reasoning as a package's own itinerary-day editor: reordering, nesting
// and retiming several events is one edit, not several.
router.get(
  '/:id/events',
  roleMiddleware(...CAN_READ_LIBRARY),
  validate(idParamSchema, 'params'),
  controller.listEvents
);
router.put(
  '/:id/events',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(idParamSchema, 'params'),
  validate(replaceDayTemplateEventsSchema),
  controller.replaceEvents
);

// Write — admin + data_feeder only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(createDayTemplateSchema),
  controller.create
);
router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(idParamSchema, 'params'),
  validate(updateDayTemplateSchema),
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
