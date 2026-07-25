const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { resolveStoragePath } = require('./pdfService');
const visaCountryService = require('./visaCountryService');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const afterCommit = require('../utils/afterCommit');

const VISA_DOCUMENT_UPLOAD_DIR_REL = path.join('storage', 'visa-documents');

// A request may only be edited (passengers replaced) while it is still a draft — once payment
// starts the commercial/legal facts on it are meant to be fixed, same principle as quotes
// locking after QUOTE_GENERATED.
const EDITABLE_STATUSES = ['APPLICATION_SUBMITTED'];

// Statuses where the request has become an operational/financial record and must stay visible.
// Mirrors quoteService.NON_ARCHIVABLE_STATUSES. PAYMENT_APPROVED is included defensively even
// though it is not a resting value in practice (approval lands directly on
// VISA_PROCESSING_STARTED — see paymentService.approve) in case a future code path or a crash
// mid-transition ever leaves a row parked there.
const NON_ARCHIVABLE_STATUSES = ['PAYMENT_APPROVED', 'VISA_PROCESSING_STARTED', 'COMPLETED'];

const REQUEST_DETAIL_INCLUDE = {
  visaCountry: { select: { id: true, name: true, archived: true } },
  partner: {
    select: {
      id: true,
      email: true,
      partnerProfile: { select: { id: true, companyName: true } },
    },
  },
  passengers: {
    where: { archived: false },
    orderBy: { createdAt: 'asc' },
    include: {
      documentUploads: { where: { archived: false }, orderBy: { documentName: 'asc' } },
    },
  },
  payments: { where: { archived: false }, orderBy: { createdAt: 'desc' } },
};

/** "VISA-<time>-<random>" — readable enough to quote over the phone, unique enough in practice. */
function generateApplicationNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VISA-${stamp}-${rand}`;
}

/**
 * Fetches a visa request and enforces tenancy.
 *
 * "Not found" and "not yours" deliberately return the SAME 404 — same reasoning as
 * quoteService.getForUser: a 403 would confirm the id exists, leaking it across partners.
 */
async function getForUser(id, user, { include = REQUEST_DETAIL_INCLUDE } = {}) {
  const visaRequest = await prisma.visaRequest.findUnique({ where: { id }, include });

  const denied = !visaRequest || (user.role !== 'admin' && visaRequest.partnerId !== user.id);
  if (denied) throw ApiError.notFound(`No visa request exists with id ${id}`);

  return visaRequest;
}

/**
 * Which mandatory documents are still missing, per passenger.
 *
 * Pure function: takes passengers (each with a `documentUploads` array carrying at least
 * `documentName`) and the country's currently-required documents, and returns exactly the shape
 * the brief specified: { readyToSubmit, missing: [{ passengerId, passengerName, missingDocs }] }.
 */
function computeReadiness(passengers, requiredDocuments) {
  const mandatoryNames = requiredDocuments.filter((d) => d.isMandatory).map((d) => d.documentName);

  const missing = [];
  for (const passenger of passengers) {
    const uploadedNames = new Set((passenger.documentUploads || []).map((u) => u.documentName));
    const missingDocs = mandatoryNames.filter((name) => !uploadedNames.has(name));

    if (missingDocs.length) {
      missing.push({ passengerId: passenger.id, passengerName: passenger.fullName, missingDocs });
    }
  }

  return { readyToSubmit: missing.length === 0, missing };
}

/**
 * The request's OWN frozen checklist — never the country's live one.
 *
 * See VisaRequestRequiredDoc in schema.prisma: copy-on-select (rule 2) applied to the visa
 * checklist, same principle as PackageDay/PackageHotel and Quote.rawPriceAtQuote. Without this,
 * an admin editing the country's checklist after a request was created would shift the
 * requirements underneath a partner who may have already satisfied the old one.
 */
async function getRequiredDocSnapshot(visaRequestId) {
  return prisma.visaRequestRequiredDoc.findMany({
    where: { visaRequestId, archived: false },
    orderBy: { documentName: 'asc' },
  });
}

/**
 * Readiness for a request by id, without the rest of the detail payload — used by
 * paymentService as the "validate before submission" precondition (Part D).
 *
 * Reads the request's own frozen checklist snapshot, not the country's live one.
 */
async function getReadiness(visaRequestId) {
  const request = await prisma.visaRequest.findUnique({
    where: { id: visaRequestId },
    select: {
      passengers: {
        where: { archived: false },
        select: {
          id: true,
          fullName: true,
          documentUploads: { where: { archived: false }, select: { documentName: true } },
        },
      },
    },
  });

  if (!request) throw ApiError.notFound(`No visa request exists with id ${visaRequestId}`);

  const requiredDocuments = await getRequiredDocSnapshot(visaRequestId);

  return computeReadiness(request.passengers, requiredDocuments);
}

/** Full detail: request + passengers + their uploads + the frozen checklist + readiness + latest payment. */
async function getDetailForUser(id, user) {
  const visaRequest = await getForUser(id, user);

  const requiredDocuments = await getRequiredDocSnapshot(id);
  const documentReadiness = computeReadiness(visaRequest.passengers, requiredDocuments);

  return {
    ...visaRequest,
    requiredDocuments,
    documentReadiness,
    latestPayment: visaRequest.payments[0] ?? null,
  };
}

/**
 * Creates the request shell + all passenger rows + the frozen checklist snapshot, all in one
 * transaction.
 *
 * The country's CURRENT non-archived VisaRequiredDocument rows are copied into
 * VisaRequestRequiredDoc for this request only, at this instant — this is the copy-on-select
 * moment (rule 2). From here on, editing the country's checklist can never reach this request.
 *
 * applicationNumber collisions are astronomically unlikely (time + random) but the column is
 * @unique, so a retry loop handles the theoretical case cleanly instead of surfacing a raw P2002.
 */
async function createRequestWithRetry(visaCountryId, passengers, partnerId, attempt = 0) {
  const applicationNumber = generateApplicationNumber();

  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.visaRequest.create({
        data: {
          partnerId,
          visaCountryId,
          applicationNumber,
          status: 'APPLICATION_SUBMITTED',
        },
      });

      await tx.visaPassenger.createMany({
        data: passengers.map((p) => ({ ...p, visaRequestId: request.id })),
      });

      const currentChecklist = await tx.visaRequiredDocument.findMany({
        where: { visaCountryId, archived: false },
      });

      if (currentChecklist.length) {
        await tx.visaRequestRequiredDoc.createMany({
          data: currentChecklist.map((d) => ({
            visaRequestId: request.id,
            documentName: d.documentName,
            isMandatory: d.isMandatory,
          })),
        });
      }

      return request;
    });
  } catch (err) {
    const isApplicationNumberClash =
      err.code === 'P2002' && (err.meta?.target ?? []).includes('applicationNumber');

    if (isApplicationNumberClash && attempt < 5) {
      return createRequestWithRetry(visaCountryId, passengers, partnerId, attempt + 1);
    }
    throw err;
  }
}

async function create({ visaCountryId, passengers }, user) {
  await visaCountryService.assertActiveVisaCountry(visaCountryId); // 400 if missing/archived

  const created = await createRequestWithRetry(visaCountryId, passengers, user.id);

  return getDetailForUser(created.id, user);
}

async function list(filters, user) {
  const { partnerId, status, includeArchived = false } = filters;

  const where = {};
  if (!includeArchived) where.archived = false;
  if (status) where.status = status;

  if (user.role === 'admin') {
    if (partnerId) where.partnerId = partnerId; // admin-only filter
  } else {
    where.partnerId = user.id;
  }

  const requests = await prisma.visaRequest.findMany({
    where,
    select: {
      id: true,
      applicationNumber: true,
      status: true,
      archived: true,
      createdAt: true,
      updatedAt: true,
      visaCountry: { select: { id: true, name: true } },
      partner: {
        select: { id: true, email: true, partnerProfile: { select: { companyName: true } } },
      },
      _count: { select: { passengers: { where: { archived: false } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests.map((r) => ({
    id: r.id,
    applicationNumber: r.applicationNumber,
    status: r.status,
    archived: r.archived,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    countryName: r.visaCountry.name,
    agencyName: r.partner.partnerProfile?.companyName ?? null,
    passengerCount: r._count.passengers,
  }));
}

async function getById(id, user) {
  return getDetailForUser(id, user);
}

/**
 * Replace-passengers pattern: archive the old passenger rows (and, since a document upload has
 * no meaning independent of the passenger it was submitted for, archive their uploads
 * alongside), then insert fresh copies — all in one transaction. Allowed only while
 * APPLICATION_SUBMITTED, same reasoning as quotes locking after QUOTE_GENERATED.
 */
async function update(id, { passengers }, user) {
  const existing = await getForUser(id, user);

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict(
      `Cannot edit passengers, application already in progress (status: ${existing.status}). ` +
        `Only ${EDITABLE_STATUSES.join('/')} requests can be edited.`
    );
  }

  const oldPassengerIds = existing.passengers.map((p) => p.id);

  await prisma.$transaction(async (tx) => {
    if (oldPassengerIds.length) {
      await tx.visaDocumentUpload.updateMany({
        where: { visaPassengerId: { in: oldPassengerIds }, archived: false },
        data: { archived: true },
      });
      await tx.visaPassenger.updateMany({
        where: { id: { in: oldPassengerIds }, archived: false },
        data: { archived: true },
      });
    }

    await tx.visaPassenger.createMany({
      data: passengers.map((p) => ({ ...p, visaRequestId: id })),
    });
  });

  return getDetailForUser(id, user);
}

/**
 * Soft delete (locked rule 1). Blocked once payment is approved / processing has started /
 * the visa is complete — those are operational and financial records, same reasoning as
 * quoteService's archive lock on BOOKING_CONFIRMED / ORDER_COMPLETED.
 */
async function archive(id, user) {
  const existing = await getForUser(id, user);

  if (NON_ARCHIVABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict(
      `Cannot archive a visa request that is approved, processing, or completed (status: ${existing.status}).`
    );
  }

  if (existing.archived) return { visaRequest: existing, alreadyInState: true };

  await prisma.visaRequest.update({ where: { id }, data: { archived: true } });

  return { visaRequest: await getForUser(id, user), alreadyInState: false };
}

/**
 * Uploads (or replaces) one passenger's proof for one document type.
 *
 * documentName is validated against THIS REQUEST'S frozen checklist snapshot (mandatory or
 * optional — an optional supporting document is still a recognised type, just not required for
 * readiness), not the country's live list, so an admin editing the checklist after this request
 * was created can neither block nor silently accept an upload it didn't originally ask for. It
 * is then copied onto VisaDocumentUpload as a plain string — never an FK back to
 * VisaRequiredDocument (locked rule 2) — so re-configuring the checklist later can never
 * invalidate an already-submitted upload.
 *
 * No status gate: unlike PATCH (which is explicitly locked to APPLICATION_SUBMITTED), the brief
 * does not restrict when a document may be uploaded, so a partner can add or correct a document
 * at any request status. Worth revisiting if uploads should freeze once VISA_PROCESSING_STARTED.
 */
async function uploadDocument(visaRequestId, passengerId, documentName, file, user) {
  const request = await prisma.visaRequest.findUnique({
    where: { id: visaRequestId },
    select: { id: true, partnerId: true },
  });

  const denied = !request || (user.role !== 'admin' && request.partnerId !== user.id);
  if (denied) throw ApiError.notFound(`No visa request exists with id ${visaRequestId}`);

  const passenger = await prisma.visaPassenger.findUnique({ where: { id: passengerId } });
  if (!passenger || passenger.visaRequestId !== visaRequestId || passenger.archived) {
    throw ApiError.notFound(`No passenger exists with id ${passengerId} on this request`);
  }

  const requiredDocuments = await getRequiredDocSnapshot(visaRequestId);
  const recognized = requiredDocuments.some((d) => d.documentName === documentName);

  if (!recognized) {
    const known = requiredDocuments.map((d) => d.documentName).join(', ') || '(none configured)';
    throw ApiError.badRequest(
      `"${documentName}" is not a recognized document for this request. Recognized: ${known}`
    );
  }

  const relativePath = path
    .join(VISA_DOCUMENT_UPLOAD_DIR_REL, path.basename(file.path))
    .split(path.sep)
    .join('/');

  await prisma.$transaction(async (tx) => {
    // A second upload for the same documentName supersedes the first: archive the old row
    // rather than delete it (rule 1), then insert the new one.
    await tx.visaDocumentUpload.updateMany({
      where: { visaPassengerId: passengerId, documentName, archived: false },
      data: { archived: true },
    });
    await tx.visaDocumentUpload.create({
      data: { visaPassengerId: passengerId, documentName, filePath: relativePath },
    });
  });

  return getDetailForUser(visaRequestId, user);
}

/**
 * Resolves an uploaded document for streaming. Ownership-checked (partner owns the request, or
 * admin). Deliberately queried outside REQUEST_DETAIL_INCLUDE, which filters archived uploads —
 * an admin auditing a superseded proof must still be able to reach it by its own id.
 */
async function getDocumentFile(visaRequestId, passengerId, uploadId, user) {
  const request = await prisma.visaRequest.findUnique({
    where: { id: visaRequestId },
    select: { id: true, partnerId: true },
  });

  const denied = !request || (user.role !== 'admin' && request.partnerId !== user.id);
  if (denied) throw ApiError.notFound(`No visa request exists with id ${visaRequestId}`);

  const upload = await prisma.visaDocumentUpload.findUnique({
    where: { id: uploadId },
    include: { visaPassenger: { select: { id: true, visaRequestId: true, fullName: true } } },
  });

  if (
    !upload ||
    upload.visaPassenger.visaRequestId !== visaRequestId ||
    upload.visaPassenger.id !== passengerId
  ) {
    throw ApiError.notFound(`No document upload exists with id ${uploadId} for this passenger`);
  }

  const absolutePath = resolveStoragePath(upload.filePath);
  if (!fs.existsSync(absolutePath)) {
    throw ApiError.notFound('The uploaded file for this document is missing from storage');
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType =
    ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

  return { absolutePath, contentType, upload, passengerName: upload.visaPassenger.fullName };
}

/** Admin-only: marks visa processing as finished. Only valid once ops has actually started. */
async function complete(id, user) {
  const existing = await getForUser(id, user);

  if (existing.status !== 'VISA_PROCESSING_STARTED') {
    throw ApiError.conflict(
      `Cannot complete a visa request in status ${existing.status}. ` +
        'Only VISA_PROCESSING_STARTED requests can be completed.'
    );
  }

  await prisma.visaRequest.update({ where: { id }, data: { status: 'COMPLETED' } });

  await afterCommit(
    async () => {
      const companyName = existing.partner.partnerProfile?.companyName ?? existing.partner.email;
      const vars = {
        companyName,
        applicationNumber: existing.applicationNumber,
        countryName: existing.visaCountry.name,
      };

      await emailService.sendTemplatedEmail('visa_completed', existing.partner.email, vars);
      await notificationService.createNotification(
        existing.partner.id,
        'ORDER_COMPLETED',
        `Visa application ${existing.applicationNumber} (${existing.visaCountry.name}) is complete.`
      );
    },
    { label: 'visa completed notifications' }
  );

  return getDetailForUser(id, user);
}

// Statuses from which the whole application can still be killed outright. Once payment has
// actually been approved (PAYMENT_APPROVED/VISA_PROCESSING_STARTED/COMPLETED) the application
// is a live/finished order, not a pending decision — REJECTED at that point would contradict
// money that already moved, so those statuses are refused, same spirit as NON_ARCHIVABLE_STATUSES.
const REJECTABLE_STATUSES = ['APPLICATION_SUBMITTED', 'PENDING_VERIFICATION'];

/**
 * Rejects the WHOLE application outright — distinct from rejecting one payment
 * (`paymentService.reject`), which only sends the request back to `APPLICATION_SUBMITTED` so a
 * corrected payment can follow. This ends the deal: `VisaRequestStatus.REJECTED`, previously an
 * enum value nothing in the codebase ever set (see PROJECT_SPEC.md's step-7 open item).
 *
 * Deliberately does not touch any Payment row tied to this request — if one happens to be
 * PENDING_VERIFICATION when the application is rejected outright, it is left exactly as is
 * rather than invented cascade logic the brief didn't ask for.
 */
async function rejectApplication(id, adminRemarks, user) {
  const existing = await getForUser(id, user);

  if (!REJECTABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict(
      `Cannot reject a visa request in status ${existing.status}. Only ${REJECTABLE_STATUSES.join(
        '/'
      )} requests can be rejected outright.`
    );
  }

  await prisma.visaRequest.update({ where: { id }, data: { status: 'REJECTED' } });

  await afterCommit(
    async () => {
      const companyName = existing.partner.partnerProfile?.companyName ?? existing.partner.email;
      const vars = {
        companyName,
        applicationNumber: existing.applicationNumber,
        remarks: adminRemarks,
      };

      // Uses a dedicated template, NOT visa_payment_rejected: that one tells the partner to
      // "submit a corrected payment", which is wrong once the whole application is rejected —
      // there is nothing left to resubmit. See prisma/seed.js for why this deviates from the
      // brief's literal "-style" wording.
      await emailService.sendTemplatedEmail('visa_application_rejected', existing.partner.email, vars);
      await notificationService.createNotification(
        existing.partner.id,
        'VISA_REQUEST_REJECTED',
        `Visa application ${existing.applicationNumber} was rejected: ${adminRemarks}`
      );
    },
    { label: 'visa application rejected notifications' }
  );

  return getDetailForUser(id, user);
}

module.exports = {
  create,
  list,
  getById,
  update,
  archive,
  uploadDocument,
  getDocumentFile,
  getReadiness,
  getRequiredDocSnapshot,
  complete,
  rejectApplication,
  getForUser,
  VISA_DOCUMENT_UPLOAD_DIR_REL,
  EDITABLE_STATUSES,
  NON_ARCHIVABLE_STATUSES,
  REJECTABLE_STATUSES,
};
