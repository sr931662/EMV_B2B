const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const visaProductService = require('./visaProductService');

// The admin-configured required-document checklist for one visa PRODUCT. SOURCE only —
// VisaDocumentUpload.documentName is a COPIED string, never an FK back here (locked rule 2), so
// re-configuring this checklist can never invalidate a passenger's already-submitted upload.
//
// Scoped to the product rather than the country because an eVisa and a sticker visa for the same
// country ask for different paperwork, and because the marketplace's "documents required" filter
// is a property of the product. `category` is the machine-readable half of each row: documentName
// stays free text for partners to read, category is what the filter reasons about.

/** 400 if the product is missing/archived/under an archived country; the parent guard for all of this. */
async function assertProduct(productId) {
  const product = await prisma.visaProduct.findUnique({
    where: { id: productId },
    select: { id: true, name: true, archived: true, country: { select: { archived: true } } },
  });

  if (!product) throw ApiError.badRequest(`No visa product exists with id ${productId}`);
  if (product.archived) {
    throw ApiError.badRequest(`Visa product "${product.name}" is archived. Restore it before editing its checklist.`);
  }

  return product;
}

async function create(productId, { documentName, isMandatory, category }) {
  await assertProduct(productId);

  return prisma.visaRequiredDocument.create({
    data: { visaProductId: productId, documentName, isMandatory, category },
  });
}

/**
 * Browsing list for the admin/partner-facing checklist UI.
 *
 * Option B (see PROJECT_SPEC.md): a document whose product or country is archived is hidden unless
 * ?includeArchived=true — the same read-time filter used for hotels/day-templates under an
 * archived destination.
 */
async function list(productId, { includeArchived = false } = {}) {
  const where = { visaProductId: productId };

  if (!includeArchived) {
    where.archived = false;
    where.visaProduct = { is: { archived: false, country: { is: { archived: false } } } };
  }

  return prisma.visaRequiredDocument.findMany({ where, orderBy: { documentName: 'asc' } });
}

/** Returns archived rows too, so an admin can inspect one before restoring it. */
async function getById(productId, docId) {
  const doc = await prisma.visaRequiredDocument.findUnique({ where: { id: docId } });

  // 404 rather than exposing "exists but under a different product" — the URL asserts the parent,
  // so a docId that does not belong to it is treated as not found here.
  if (!doc || doc.visaProductId !== productId) {
    throw ApiError.notFound(`No required document exists with id ${docId} under this product`);
  }

  return doc;
}

async function update(productId, docId, data) {
  await getById(productId, docId);

  return prisma.visaRequiredDocument.update({ where: { id: docId }, data });
}

/** Soft delete (locked rule 1). */
async function archive(productId, docId) {
  const doc = await getById(productId, docId);

  if (doc.archived) return { document: doc, alreadyInState: true };

  const archivedRow = await prisma.visaRequiredDocument.update({
    where: { id: docId },
    data: { archived: true },
  });

  return { document: archivedRow, alreadyInState: false };
}

/** Refused under an archived product, mirroring day-template/hotel restore rules. */
async function restore(productId, docId) {
  const doc = await getById(productId, docId);

  if (!doc.archived) return { document: doc, alreadyInState: true };

  await assertProduct(productId);

  const restored = await prisma.visaRequiredDocument.update({
    where: { id: docId },
    data: { archived: false },
  });

  return { document: restored, alreadyInState: false };
}

/** The profile this product's current checklist adds up to — derived, never stored. */
async function documentProfile(productId) {
  const docs = await prisma.visaRequiredDocument.findMany({
    where: { visaProductId: productId, archived: false },
    select: { category: true, archived: true },
  });

  return visaProductService.deriveDocumentProfile(docs);
}

module.exports = { create, list, getById, update, archive, restore, documentProfile };
