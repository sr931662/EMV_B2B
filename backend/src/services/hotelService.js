const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const destinationService = require('./destinationService');

// The intern's hotel library. SOURCE rows only — packages COPY this content into
// PackageHotel with no FK back here (locked rule 2). Nothing here knows about packages.

const DESTINATION_SUMMARY = { select: { id: true, name: true, archived: true } };

async function create({ destinationId, name, category, description, images }) {
  await destinationService.assertActiveDestination(destinationId); // 400 if missing/archived

  return prisma.hotel.create({
    data: { destinationId, name, category, description, images: images ?? [] },
    include: { destination: DESTINATION_SUMMARY },
  });
}

/**
 * ?destinationId= is the exact query the package builder will call for its dependent
 * dropdown, so it stays a clean indexed filter on destinationId + archived.
 *
 * Parent visibility is Option B (read-time filter, see PROJECT_SPEC.md): a hotel whose
 * destination is archived is hidden from default lists even though its own archived flag is
 * still false. Archiving a destination never mutates its children, so restoring the
 * destination brings them all back exactly as they were.
 */
async function list({ destinationId, includeArchived = false } = {}) {
  const where = {};
  if (destinationId) where.destinationId = destinationId;

  if (!includeArchived) {
    where.archived = false;
    where.destination = { is: { archived: false } };
  }

  return prisma.hotel.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { destination: DESTINATION_SUMMARY },
  });
}

/**
 * Returns archived rows too, so an admin can inspect one before restoring it — and returns
 * rows under an archived destination as well. Fetching a known id is a deliberate act, not
 * browsing, so it is not subject to the parent-visibility filter above. The controller
 * surfaces `destinationArchived` so the UI can warn instead of silently showing a hidden row.
 */
async function getById(id) {
  const hotel = await prisma.hotel.findUnique({
    where: { id },
    include: { destination: DESTINATION_SUMMARY },
  });

  if (!hotel) throw ApiError.notFound(`No hotel exists with id ${id}`);

  return hotel;
}

/**
 * name/category/description/images only — a hotel does not move between destinations.
 * `images` is replaced wholesale when supplied, not merged.
 */
async function update(id, data) {
  await getById(id);

  return prisma.hotel.update({
    where: { id },
    data,
    include: { destination: DESTINATION_SUMMARY },
  });
}

/** Soft delete (locked rule 1). */
async function archive(id) {
  const hotel = await getById(id);

  if (hotel.archived) return { hotel, alreadyInState: true };

  const archivedRow = await prisma.hotel.update({
    where: { id },
    data: { archived: true },
    include: { destination: DESTINATION_SUMMARY },
  });

  return { hotel: archivedRow, alreadyInState: false };
}

/** Refused under an archived destination, mirroring create. */
async function restore(id) {
  const hotel = await getById(id);

  if (!hotel.archived) return { hotel, alreadyInState: true };

  await destinationService.assertActiveDestination(hotel.destinationId);

  const restored = await prisma.hotel.update({
    where: { id },
    data: { archived: false },
    include: { destination: DESTINATION_SUMMARY },
  });

  return { hotel: restored, alreadyInState: false };
}

module.exports = { create, list, getById, update, archive, restore };
