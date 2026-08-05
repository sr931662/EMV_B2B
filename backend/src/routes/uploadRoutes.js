const express = require('express');
const { z } = require('zod');

const controller = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { UPLOAD_FOLDERS } = require('../services/cloudinaryService');

const router = express.Router();

router.use(authMiddleware);

const PURPOSES = Object.keys(UPLOAD_FOLDERS);

// A purpose, never a path. The server maps it to a folder, so a signature cannot be used to write
// anywhere else in the Cloudinary account.
const signatureSchema = z
  .object({
    purpose: z.enum(PURPOSES, { error: `purpose must be one of: ${PURPOSES.join(', ')}` }),
  })
  .strict();

// Mirrors Cloudinary's upload response. Unknown keys are rejected rather than passed through —
// Cloudinary returns a lot we do not store, and accepting it all would let a caller write whatever
// it liked into our record of the file.
const registerSchema = z
  .object({
    publicId: z.string().trim().min(1).max(300),
    url: z.url('url must be a valid URL').max(2048),
    kind: z.enum(['IMAGE', 'VIDEO', 'RAW']).optional().default('IMAGE'),
    visibility: z.enum(['PUBLIC', 'AUTHENTICATED']).optional().default('PUBLIC'),
    folder: z.string().trim().max(300).optional(),
    format: z.string().trim().max(20).optional(),
    bytes: z.coerce.number().int().min(0).optional(),
    width: z.coerce.number().int().min(0).optional(),
    height: z.coerce.number().int().min(0).optional(),
    originalFilename: z.string().trim().max(300).optional(),
    purpose: z.enum(PURPOSES, { error: `purpose must be one of: ${PURPOSES.join(', ')}` }),
    ownerType: z.string().trim().max(60).optional(),
    ownerId: z.string().trim().max(60).optional(),
  })
  .strict();

const attachSchema = z
  .object({
    ownerType: z.string().trim().min(1).max(60),
    ownerId: z.string().trim().min(1).max(60),
  })
  .strict();

const listSchema = z
  .object({
    purpose: z.enum(PURPOSES).optional(),
    ownerType: z.string().trim().max(60).optional(),
    ownerId: z.string().trim().max(60).optional(),
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

// Readable by anyone who can reach an admin form, so the UI knows which control to render.
router.get('/config', controller.getUploadConfig);

// Admin-only from here down, and that IS the access control on the Cloudinary account: a signature
// is permission to upload, and a delete is permanent. Neither belongs with a partner login.
router.post('/signature', roleMiddleware('admin'), validate(signatureSchema), controller.createSignature);
router.post('/register', roleMiddleware('admin'), validate(registerSchema), controller.registerAsset);
router.get('/', roleMiddleware('admin'), validate(listSchema, 'query'), controller.listAssets);

// `:publicId(*)` rather than `:publicId`: a Cloudinary public_id contains slashes
// (travnexa/visa-countries/abc123), and a plain named param stops at the first one, which would
// address a file that does not exist. The (*) makes it greedy across segments.
router.patch(
  '/:publicId(*)/attach',
  roleMiddleware('admin'),
  validate(attachSchema),
  controller.attachAsset
);

router.delete('/:publicId(*)', roleMiddleware('admin'), controller.deleteAsset);

module.exports = router;
