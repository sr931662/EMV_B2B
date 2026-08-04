const express = require('express');
const { z } = require('zod');

const controller = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { UPLOAD_FOLDERS } = require('../services/cloudinaryService');

const router = express.Router();

router.use(authMiddleware);

// A purpose, never a path. The server maps it to a folder, so a signature cannot be used to write
// anywhere else in the Cloudinary account.
const signatureSchema = z
  .object({
    purpose: z.enum(Object.keys(UPLOAD_FOLDERS), {
      error: `purpose must be one of: ${Object.keys(UPLOAD_FOLDERS).join(', ')}`,
    }),
  })
  .strict();

// Readable by anyone who can reach an admin form, so the UI knows which control to render.
router.get('/config', controller.getUploadConfig);

// Admin-only, and that is the actual access control on the Cloudinary account: a signature IS
// permission to upload, so handing one to any authenticated user would let a partner fill the
// account with whatever they liked.
router.post('/signature', roleMiddleware('admin'), validate(signatureSchema), controller.createSignature);

module.exports = router;
