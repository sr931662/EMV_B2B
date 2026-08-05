const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

const list = asyncHandler(async (req, res) => {
  const { unreadOnly, limit, offset } = req.validatedQuery;
  const { notifications, total } = await notificationService.list(req.user, { unreadOnly, limit, offset });

  res.status(200).json({ count: notifications.length, total, limit, offset, unreadOnly, notifications });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(req.user);

  res.status(200).json({ count });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user);

  res.status(200).json({ message: 'Notification marked read', notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  const { updated } = await notificationService.markAllRead(req.user);

  res.status(200).json({ message: `Marked ${updated} notification(s) read`, updated });
});

const archive = asyncHandler(async (req, res) => {
  const { notification, alreadyInState } = await notificationService.archive(req.params.id, req.user);

  res.status(200).json({
    message: alreadyInState ? 'Notification was already archived' : 'Notification archived',
    notification,
  });
});

module.exports = { list, unreadCount, markRead, markAllRead, archive };
