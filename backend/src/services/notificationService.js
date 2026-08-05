const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * Creates one in-app notification. Called (via afterCommit) alongside every partner/admin-facing
 * email event, so the bell-feed and the inbox never disagree about what happened.
 *
 * Deliberately a thin, un-guarded write: the caller has already decided the recipient and
 * message. Ownership/visibility is enforced on the READ side (list/unreadCount/markRead/archive
 * below), not here.
 */
async function createNotification(userId, type, message) {
  return prisma.notification.create({ data: { userId, type, message } });
}

/** Fans one notification out to a set of user ids — used for "notify all active admins". */
async function createNotificationForMany(userIds, type, message) {
  if (!userIds.length) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, message })),
  });
}

/**
 * Active admin users, for "admin" recipients (locked instruction: "Admin recipient = all active
 * admin users' emails"). Used by both the email side (paymentService/visaRequestService) and the
 * in-app side (createNotificationForMany), so there is exactly one definition of "who is admin".
 */
async function listActiveAdminUsers() {
  return prisma.user.findMany({
    where: { role: 'admin', archived: false },
    select: { id: true, email: true },
  });
}

async function list(user, { unreadOnly = false, limit = 20, offset = 0 } = {}) {
  const where = { userId: user.id, archived: false };
  if (unreadOnly) where.isRead = false;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total, limit, offset };
}

async function unreadCount(user) {
  return prisma.notification.count({
    where: { userId: user.id, archived: false, isRead: false },
  });
}

/**
 * Fetches a notification and enforces ownership. Same identical-404 pattern used for
 * quotes/visa requests: "not found" and "not yours" must look the same, or a 403 would confirm
 * the id exists and belongs to someone else.
 */
async function getForUser(id, user) {
  const notification = await prisma.notification.findUnique({ where: { id } });

  if (!notification || notification.userId !== user.id) {
    throw ApiError.notFound(`No notification exists with id ${id}`);
  }

  return notification;
}

async function markRead(id, user) {
  await getForUser(id, user);

  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

async function markAllRead(user) {
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, archived: false, isRead: false },
    data: { isRead: true },
  });

  return { updated: result.count };
}

/** Soft delete (locked rule 1). */
async function archive(id, user) {
  const existing = await getForUser(id, user);

  if (existing.archived) return { notification: existing, alreadyInState: true };

  const archivedRow = await prisma.notification.update({
    where: { id },
    data: { archived: true },
  });

  return { notification: archivedRow, alreadyInState: false };
}

module.exports = {
  createNotification,
  createNotificationForMany,
  listActiveAdminUsers,
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
};
