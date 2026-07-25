const express = require('express');

const controller = require('../controllers/adminUserController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { idParamSchema, listStaffUsersSchema, createStaffUserSchema } = require('../utils/staffUserSchemas');

// Mounted at /api/admin/users — admin-only. Staff (admin/data_feeder) accounts only;
// partner accounts are managed at /api/admin/agencies.
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.get('/', validate(listStaffUsersSchema, 'query'), controller.list);
router.post('/', validate(createStaffUserSchema), controller.create);
router.post('/:id/suspend', validate(idParamSchema, 'params'), controller.suspend);
router.post('/:id/activate', validate(idParamSchema, 'params'), controller.activate);

module.exports = router;
