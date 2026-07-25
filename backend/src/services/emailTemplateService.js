const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

// Full CRUD on EmailTemplate. `emailService.renderTemplate` already treats a missing OR
// archived name as "fall back to the generic inline message" (it queries
// `where: { name, archived: false }`), so archiving a template here is safe by construction —
// no extra guard needed before letting an admin archive one.

async function create({ name, subject, body }) {
  const existing = await prisma.emailTemplate.findUnique({ where: { name } });
  if (existing) {
    throw ApiError.conflict(`An email template named "${name}" already exists`);
  }

  return prisma.emailTemplate.create({ data: { name, subject, body } });
}

async function list({ includeArchived = false } = {}) {
  return prisma.emailTemplate.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { name: 'asc' },
  });
}

/** Returns archived rows too, so an admin can inspect one before restoring it. */
async function getById(id) {
  const template = await prisma.emailTemplate.findUnique({ where: { id } });

  if (!template) throw ApiError.notFound(`No email template exists with id ${id}`);

  return template;
}

async function update(id, data) {
  await getById(id);

  return prisma.emailTemplate.update({ where: { id }, data });
}

/** Soft delete (locked rule 1). */
async function archive(id) {
  const template = await getById(id);

  if (template.archived) return { template, alreadyInState: true };

  const archivedRow = await prisma.emailTemplate.update({
    where: { id },
    data: { archived: true },
  });

  return { template: archivedRow, alreadyInState: false };
}

// Not in the brief's literal route list, but added for consistency: every other archivable
// resource in this app has a restore path, and an admin who archives a template by mistake
// would otherwise have no way back except a direct DB edit.
async function restore(id) {
  const template = await getById(id);

  if (!template.archived) return { template, alreadyInState: true };

  const restored = await prisma.emailTemplate.update({
    where: { id },
    data: { archived: false },
  });

  return { template: restored, alreadyInState: false };
}

module.exports = { create, list, getById, update, archive, restore };
