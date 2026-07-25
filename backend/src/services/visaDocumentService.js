const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const visaCountryService = require('./visaCountryService');

// The admin-configured required-document checklist for a visa country. SOURCE only —
// VisaDocumentUpload.documentName is a COPIED string, never an FK back here (locked rule 2), so
// re-configuring this checklist can never invalidate a passenger's already-submitted upload.

async function create(countryId, { documentName, isMandatory }) {
  await visaCountryService.assertActiveVisaCountry(countryId); // 400 if missing/archived

  return prisma.visaRequiredDocument.create({
    data: { visaCountryId: countryId, documentName, isMandatory },
  });
}

/**
 * Browsing list for the admin/partner-facing checklist UI.
 *
 * Option B (see PROJECT_SPEC.md): a document whose country is archived is hidden unless
 * ?includeArchived=true — same read-time filter used for hotels/day-templates under an archived
 * destination. This is distinct from listActiveDocumentNames below, which intentionally does
 * NOT apply this filter (see its own comment).
 */
async function list(countryId, { includeArchived = false } = {}) {
  const where = { visaCountryId: countryId };

  if (!includeArchived) {
    where.archived = false;
    where.visaCountry = { is: { archived: false } };
  }

  return prisma.visaRequiredDocument.findMany({ where, orderBy: { documentName: 'asc' } });
}

/** Returns archived rows too, so an admin can inspect one before restoring it. */
async function getById(countryId, docId) {
  const doc = await prisma.visaRequiredDocument.findUnique({ where: { id: docId } });

  // 404 rather than exposing "exists but under a different country" — the URL asserts the
  // parent, so a docId that does not belong to it is treated as not found here.
  if (!doc || doc.visaCountryId !== countryId) {
    throw ApiError.notFound(`No required document exists with id ${docId} under this country`);
  }

  return doc;
}

async function update(countryId, docId, data) {
  await getById(countryId, docId);

  return prisma.visaRequiredDocument.update({ where: { id: docId }, data });
}

/** Soft delete (locked rule 1). */
async function archive(countryId, docId) {
  const doc = await getById(countryId, docId);

  if (doc.archived) return { document: doc, alreadyInState: true };

  const archivedRow = await prisma.visaRequiredDocument.update({
    where: { id: docId },
    data: { archived: true },
  });

  return { document: archivedRow, alreadyInState: false };
}

/** Refused under an archived country, mirroring day-template/hotel restore rules. */
async function restore(countryId, docId) {
  const doc = await getById(countryId, docId);

  if (!doc.archived) return { document: doc, alreadyInState: true };

  await visaCountryService.assertActiveVisaCountry(countryId);

  const restored = await prisma.visaRequiredDocument.update({
    where: { id: docId },
    data: { archived: false },
  });

  return { document: restored, alreadyInState: false };
}

/**
 * All currently-required document names for a country, regardless of whether the COUNTRY itself
 * is archived — used by visaRequestService for (a) validating an uploaded document's name is
 * recognised, and (b) computing readyToSubmit.
 *
 * Deliberately NOT Option-B filtered by country.archived, unlike list() above. Archiving a
 * country stops new visa REQUESTS from being created against it (visaCountryService guards
 * that), but does not retroactively invalidate requests already in flight — those partners
 * still need to know what documents are required and still need to be able to satisfy the
 * checklist and pay. There is no snapshot of "the checklist as it was when the request was
 * created" anywhere in the schema, so this always reflects the current checklist.
 */
async function listActiveRequiredDocuments(countryId) {
  return prisma.visaRequiredDocument.findMany({
    where: { visaCountryId: countryId, archived: false },
    orderBy: { documentName: 'asc' },
  });
}

module.exports = { create, list, getById, update, archive, restore, listActiveRequiredDocuments };
