const express = require('express');

const controller = require('../controllers/libraryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { uploadSpreadsheet, requireFile } = require('../middleware/upload');
const { CAN_WRITE_LIBRARY, CAN_READ_LIBRARY } = require('../utils/roles');

const router = express.Router();

router.use(authMiddleware);

/**
 * One route table for every library entity, driven by libraryRegistry.
 *
 * Reads are open to partners as well: they see the library through pickers when building a quote,
 * and hiding it would mean duplicating every option list into the partner-facing API.
 *
 * Writes are admin + data_feeder, matching CAN_WRITE_LIBRARY. The finer question — which FIELDS a
 * data feeder may write — is settled in libraryRegistry.stripForbiddenFields rather than here,
 * because it varies per field, not per route.
 */

// Lets the admin shell build itself from the registry instead of hardcoding a list of modules.
router.get('/entities', roleMiddleware(...CAN_READ_LIBRARY), controller.listEntities);

// Company-wide prose. The health check reports blocks a voucher needs and nobody has written —
// admin-only because "our terms and conditions are missing" is not a partner's business.
router.get('/note-blocks/health', roleMiddleware('admin'), controller.noteBlockHealth);
router.post('/note-blocks/ensure-stubs', roleMiddleware('admin'), controller.ensureNoteBlockStubs);

// Cancellation bands. Registered before '/:entity' so the literal segments win.
router.get(
  '/cancellation-policy/:id/tiers',
  roleMiddleware(...CAN_READ_LIBRARY),
  controller.getTiers
);
router.put('/cancellation-policy/:id/tiers', roleMiddleware('admin'), controller.setTiers);
// A preview is a read: a partner asking what a cancellation would cost is the whole point.
router.get(
  '/cancellation-policy/:id/preview',
  roleMiddleware(...CAN_READ_LIBRARY),
  controller.previewCancellation
);

// Attaching library items to packages, countries, destinations and visa products.
router.get(
  '/attachments/:ownerType/:ownerId',
  roleMiddleware(...CAN_READ_LIBRARY),
  controller.getAttachments
);
router.put(
  '/attachments/:ownerType/:ownerId',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  controller.setAttachments
);

// Registered before '/:entity/:id' so the literal segments win over the parameter.
router.get('/:entity/search', roleMiddleware(...CAN_READ_LIBRARY), controller.search);

// Excel bulk import/export — same read/write boundary as every other route on this entity, since
// bulkDataService writes through libraryService.create/update rather than around it.
router.get('/:entity/export', roleMiddleware(...CAN_READ_LIBRARY), controller.exportEntity);
router.post(
  '/:entity/import',
  roleMiddleware(...CAN_WRITE_LIBRARY),
  uploadSpreadsheet('file'),
  requireFile('file'),
  controller.importEntity
);

router.get('/:entity', roleMiddleware(...CAN_READ_LIBRARY), controller.list);
router.get('/:entity/:id', roleMiddleware(...CAN_READ_LIBRARY), controller.getOne);
router.get('/:entity/:id/usage', roleMiddleware(...CAN_READ_LIBRARY), controller.usage);
router.get('/:entity/:id/history', roleMiddleware(...CAN_READ_LIBRARY), controller.history);

router.post('/:entity', roleMiddleware(...CAN_WRITE_LIBRARY), controller.create);
router.patch('/:entity/:id', roleMiddleware(...CAN_WRITE_LIBRARY), controller.update);

// Archive and restore are admin-only, unlike ordinary edits: withdrawing something the whole
// catalogue may depend on is a different kind of decision from correcting its description.
router.post('/:entity/:id/archive', roleMiddleware('admin'), controller.archive);
router.post('/:entity/:id/restore', roleMiddleware('admin'), controller.restore);

module.exports = router;
