const express = require('express');

const controller = require('../controllers/emailTemplateController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const {
  idParamSchema,
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  listEmailTemplatesSchema,
} = require('../utils/emailTemplateSchemas');

// Mounted at /api/admin/email-templates — admin-only.
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.get('/', validate(listEmailTemplatesSchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post('/', validate(createEmailTemplateSchema), controller.create);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateEmailTemplateSchema), controller.update);
router.delete('/:id', validate(idParamSchema, 'params'), controller.archive);
router.post('/:id/restore', validate(idParamSchema, 'params'), controller.restore);

module.exports = router;
