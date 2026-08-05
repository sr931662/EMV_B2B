const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const authService = require('./authService');

const STAFF_SELECT = {
  id: true,
  email: true,
  role: true,
  isVerified: true,
  archived: true,
  createdAt: true,
};

/** Admin + data_feeder only — partners are managed at /api/admin/agencies. */
async function list({ includeArchived = false, limit = 50, offset = 0 } = {}) {
  const where = { role: { in: ['admin', 'data_feeder'] } };
  if (!includeArchived) where.archived = false;

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: STAFF_SELECT, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    prisma.user.count({ where }),
  ]);

  return { users, total, limit, offset };
}

/** Thin wrapper over the existing authService helper — no OTP, verified on creation. */
async function create({ email, password, role }) {
  return authService.createStaffUser({ email, password }, role);
}

async function assertIsStaff(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });

  if (!user || !['admin', 'data_feeder'].includes(user.role)) {
    throw ApiError.notFound(`No staff user exists with id ${id}`);
  }
}

/** Suspend = archive + revoke sessions. An admin may never suspend their own account. */
async function suspend(id, requestingAdmin) {
  if (id === requestingAdmin.id) {
    throw ApiError.badRequest('You cannot suspend your own account.');
  }

  await assertIsStaff(id);

  await prisma.user.update({ where: { id }, data: { archived: true } });
  await authService.incrementTokenVersion(id);

  return prisma.user.findUnique({ where: { id }, select: STAFF_SELECT });
}

async function activate(id) {
  await assertIsStaff(id);

  await prisma.user.update({ where: { id }, data: { archived: false } });

  return prisma.user.findUnique({ where: { id }, select: STAFF_SELECT });
}

module.exports = { list, create, suspend, activate };
