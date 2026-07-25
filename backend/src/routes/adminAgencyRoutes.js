const express = require('express');

const controller = require('../controllers/adminAgencyController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { idParamSchema, listAgenciesSchema } = require('../utils/agencySchemas');

// Mounted at /api/admin/agencies — admin-only.
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.get('/', validate(listAgenciesSchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post('/:id/suspend', validate(idParamSchema, 'params'), controller.suspend);
router.post('/:id/activate', validate(idParamSchema, 'params'), controller.activate);

module.exports = router;
