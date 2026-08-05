const express = require('express');

const controller = require('../controllers/destinationController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { uploadSpreadsheet, requireFile } = require('../middleware/upload');
const { CAN_WRITE_LIBRARY, CAN_READ_LIBRARY } = require('../utils/roles');
const {
  idParamSchema,
  createDestinationSchema,
  updateDestinationSchema,
  listDestinationsSchema,
} = require('../utils/librarySchemas');

const router = express.Router();

// Nothing in the library is public: every route below is authenticated first.
router.use(authMiddleware);

// Read — any authenticated role
router.get(
  '/',
  roleMiddleware(...CAN_READ_LIBRARY),
  validate(listDestinationsSchema, 'query'),
  controller.list
);

// Excel bulk import/export. Registered before '/:id' so the literal segment wins.
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

// Write — admin + data_feeder only
router.post(
  '/',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(createDestinationSchema),
  controller.create
);
router.patch(
  '/:id',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  validate(idParamSchema, 'params'),
  validate(updateDestinationSchema),
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
