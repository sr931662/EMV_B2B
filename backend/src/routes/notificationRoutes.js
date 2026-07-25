const express = require('express');

const controller = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { idParamSchema, listNotificationsSchema } = require('../utils/notificationSchemas');

// Every role gets notifications (partner AND admin), always scoped to the caller's own —
// there is no role split here, just authentication + per-row ownership
// (notificationService.getForUser).
const router = express.Router();

router.use(authMiddleware);

router.get('/', validate(listNotificationsSchema, 'query'), controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.markAllRead);

router.post('/:id/read', validate(idParamSchema, 'params'), controller.markRead);
router.delete('/:id', validate(idParamSchema, 'params'), controller.archive);

module.exports = router;
