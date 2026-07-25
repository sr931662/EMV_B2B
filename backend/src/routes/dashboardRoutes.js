const express = require('express');

const controller = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { CAN_ACCESS_DASHBOARD } = require('../utils/roles');

// Mounted at /api/dashboard — partner-only (module 3's partner dashboard payload).
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(...CAN_ACCESS_DASHBOARD));

router.get('/', controller.get);

module.exports = router;
