const express = require('express');

const controller = require('../controllers/adminReportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { reportSummarySchema } = require('../utils/reportSchemas');

// Mounted at /api/admin/reports — admin-only.
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.get('/summary', validate(reportSummarySchema, 'query'), controller.summary);

module.exports = router;
