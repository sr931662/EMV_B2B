const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { resolveStoragePath } = require('./pdfService');
const visaProductService = require('./visaProductService');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const afterCommit = require('../utils/afterCommit');

const VISA_DOCUMENT_UPLOAD_DIR_REL = path.join('storage', 'visa-documents');
const EVISA_DOCUMENT_UPLOAD_DIR_REL = path.join('storage', 'evisa-documents');

const BASE_REQUIRED_DOCUMENTS = [
  'Passport',
  'PAN',
  'Photo',
  'Flight Tickets (Round Trip)',
  'Hotel Voucher',
  'Bank Statement',
];

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
  // Selected under its real relation name (`country`, pointing at the merged Country table since
  // the contract-step migration); presentVisaRequest() below re-keys it to `visaCountry` in every
  // response, so the API shape — and the frontend built against it — is unchanged.
  country: { select: { id: true, name: true, archived: true, baseFee: true } },
  // Null on requests created before visa products existed — every consumer must tolerate that.
  visaProduct: {
    select: {
      id: true,
      name: true,
      category: true,
      adultFee: true,
      childFee: true,
      processingDaysMin: true,
      processingDaysMax: true,
      validityDays: true,
      maxStayDays: true,
      entryType: true,
    },
  },
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

/**
 * Renames the `country` relation to `visaCountry` on the way out.
 *
 * The contract-step migration merged VisaCountry into Country and repointed this request's FK
 * directly at it, but every existing reader — this file's own pricing math below, the partner and
 * admin request-detail pages — was built reading `visaRequest.visaCountry.name`. Renaming the key
 * here, once, keeps all of that working without hunting down every call site.
 */
function presentVisaRequest(row) {
  if (!row) return row;

  const { country, ...rest } = row;

  return { ...rest, visaCountry: country };
}

/** "VISA-<time>-<random>" — readable enough to quote over the phone, unique enough in practice. */
function generateApplicationNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VISA-${stamp}-${rand}`;
}

/** Splits a passenger list into how many are charged at each of the product's two rates. */
function countByType(passengers = []) {
  const adults = passengers.filter((p) => (p.passengerType ?? 'ADULT') !== 'CHILD').length;

  return { adults, children: passengers.length - adults };
}

/**
 * sellingPrice = adults × adultFee + children × childFee + markupAmount.
 *
 * Both fees are always the request's OWN frozen snapshots, never the live product — frozen once in
 * `create()` below and never re-read afterward, so repricing a product cannot move the numbers on
 * a request already in flight (copy-on-select, rule 2).
 *
 * Uses Prisma.Decimal throughout, never JS floats: this value gets invoiced and reconciled against
 * a real payment. paymentService derives what the partner owes as sellingPrice − markupAmount, so
 * it needs no knowledge of the passenger mix — but it does depend on this staying exact.
 */
function computeSellingPrice({ adultFee, childFee, adults, children, markupAmount }) {
  return new Prisma.Decimal(adultFee)
    .times(adults)
    .plus(new Prisma.Decimal(childFee).times(children))
    .plus(new Prisma.Decimal(markupAmount));
}

/**
 * Pricing block attached to every request detail response — mirrors the shape of a quote's
 * pricing (rawPriceAtQuote/markupAmount/sellingPrice/rawPriceChangedSinceQuote), applied to
 * visas. `passengerCount` is the LIVE count of non-archived passengers: it is not a separate
 * stored column (see the comment on VisaRequest.baseFeeAtRequest in schema.prisma).
 * `feeChangedSinceRequest` is informational only — nothing computes from it.
 */
function computePricingBlock(visaRequest) {
  const baseFeeAtRequest = new Prisma.Decimal(visaRequest.baseFeeAtRequest);
  const adultFeeAtRequest = new Prisma.Decimal(visaRequest.adultFeeAtRequest);
  const childFeeAtRequest = new Prisma.Decimal(visaRequest.childFeeAtRequest);
  const markupAmount = new Prisma.Decimal(visaRequest.markupAmount);
  const passengerCount = visaRequest.passengers.length;
  const { adults, children } = countByType(visaRequest.passengers);

  // Compare against the product's live adult fee when there is one, since that is what this
  // request was priced from. Requests predating visa products have no product and still fall back
  // to the country fee, which is what they were actually priced from.
  const liveCountryFee = new Prisma.Decimal(
    visaRequest.visaProduct?.adultFee ?? visaRequest.visaCountry.baseFee
  );

  return {
    baseFeeAtRequest,
    adultFeeAtRequest,
    childFeeAtRequest,
    passengerCount,
    adultCount: adults,
    childCount: children,
    visaCost: adultFeeAtRequest.times(adults).plus(childFeeAtRequest.times(children)),
    markupAmount,
    sellingPrice: new Prisma.Decimal(visaRequest.sellingPrice),
    liveCountryFee,
    feeChangedSinceRequest: !adultFeeAtRequest.equals(liveCountryFee),
  };
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

  return presentVisaRequest(visaRequest);
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
    // The library's guidance rides along with the frozen line. A specimen and a
    // "valid 6 months beyond travel" note are maintained once and shown at the moment they are
    // needed — which is what turns a rejected upload into an upload that was right first time.
    //
    // Note this is the one part read LIVE: if an admin improves the guidance, everyone still
    // waiting to upload benefits. The requirement itself — the name and whether it is mandatory —
    // stays frozen.
    include: {
      documentType: {
        select: { id: true, name: true, sampleImageUrl: true, requirementNotes: true, subject: true },
      },
    },
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

/** Full detail: request + passengers + their uploads + the frozen checklist + readiness + pricing + latest payment. */
async function getDetailForUser(id, user) {
  const visaRequest = await getForUser(id, user);

  const requiredDocuments = await getRequiredDocSnapshot(id);
  const documentReadiness = computeReadiness(visaRequest.passengers, requiredDocuments);
  const pricing = computePricingBlock(visaRequest);
  const evisaDocumentAvailable = visaRequest.visaType === 'E_VISA' && Boolean(visaRequest.evisaDocumentPath);

  return {
    ...visaRequest,
    requiredDocuments,
    documentReadiness,
    pricing,
    latestPayment: visaRequest.payments[0] ?? null,
    evisaDocumentAvailable,
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
async function createRequestWithRetry(
  { countryId, visaProductId },
  visaType,
  passengers,
  partnerId,
  pricing,
  attempt = 0
) {
  const applicationNumber = generateApplicationNumber();

  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.visaRequest.create({
        data: {
          partnerId,
          countryId,
          visaProductId,
          visaType,
          applicationNumber,
          status: 'APPLICATION_SUBMITTED',
          baseFeeAtRequest: pricing.baseFeeAtRequest,
          adultFeeAtRequest: pricing.adultFeeAtRequest,
          childFeeAtRequest: pricing.childFeeAtRequest,
          markupAmount: pricing.markupAmount,
          sellingPrice: pricing.sellingPrice,
        },
      });

      await tx.visaPassenger.createMany({
        data: passengers.map((p) => ({ ...p, visaRequestId: request.id })),
      });

      // Checklists hang off the PRODUCT, not the country — an eVisa and a sticker visa for the
      // same country ask for different paperwork.
      const currentChecklist = await tx.visaRequiredDocument.findMany({
        where: { visaProductId, archived: false },
      });
      const snapshotNames = new Set();
      const snapshotRows = [];

      for (const name of BASE_REQUIRED_DOCUMENTS) {
        snapshotNames.add(name);
        snapshotRows.push({
          visaRequestId: request.id,
          documentName: name,
          isMandatory: true,
        });
      }

      for (const doc of currentChecklist) {
        if (snapshotNames.has(doc.documentName)) continue;
        snapshotNames.add(doc.documentName);
        snapshotRows.push({
          visaRequestId: request.id,
          documentName: doc.documentName,
          isMandatory: doc.isMandatory,
          // Carried across with the name, not instead of it. The NAME is the frozen promise — what
          // this partner was told to produce, which must not change if the library is later
          // reworded (locked rule 2). The TYPE is a live reference, and it is what lets the upload
          // screen show the specimen and the requirement notes rather than just a label.
          documentTypeId: doc.documentTypeId ?? null,
        });
      }

      if (snapshotRows.length) {
        await tx.visaRequestRequiredDoc.createMany({
          data: snapshotRows,
        });
      }

      return request;
    });
  } catch (err) {
    const isApplicationNumberClash =
      err.code === 'P2002' && (err.meta?.target ?? []).includes('applicationNumber');

    if (isApplicationNumberClash && attempt < 5) {
      return createRequestWithRetry(
        { countryId, visaProductId },
        visaType,
        passengers,
        partnerId,
        pricing,
        attempt + 1
      );
    }
    throw err;
  }
}

async function create({ visaProductId, visaType, passengers, markupAmount = 0 }, user) {
  // 400 if missing, archived, under an archived country, or a visa-free / visa-on-arrival entry
  // that cannot be applied for at all. Also the source of the fee we freeze below.
  const product = await visaProductService.assertApplicableProduct(visaProductId);

  // Freeze the wholesale basis at this instant (copy-on-select, rule 2, applied a fourth time).
  // From here on this request's economics are independent of the product: repricing it later
  // cannot move this request's numbers.
  //
  // The fee now comes from the PRODUCT rather than the country, because a country can offer
  // several products at different prices and the country-level fee cannot represent all of them.
  const adultFeeAtRequest = new Prisma.Decimal(product.adultFee);
  const childFeeAtRequest = new Prisma.Decimal(product.childFee);
  const { adults, children } = countByType(passengers);

  const sellingPrice = computeSellingPrice({
    adultFee: adultFeeAtRequest,
    childFee: childFeeAtRequest,
    adults,
    children,
    markupAmount,
  });

  const created = await createRequestWithRetry(
    { countryId: product.countryId, visaProductId },
    visaType,
    passengers,
    user.id,
    {
      // Kept equal to the adult fee so anything still reading the original column stays correct.
      baseFeeAtRequest: adultFeeAtRequest,
      adultFeeAtRequest,
      childFeeAtRequest,
      markupAmount: new Prisma.Decimal(markupAmount),
      sellingPrice,
    }
  );

  return getDetailForUser(created.id, user);
}

async function list(filters, user) {
  const { partnerId, status, includeArchived = false, limit = 50, offset = 0 } = filters;

  const where = {};
  if (!includeArchived) where.archived = false;
  if (status) where.status = status;

  if (user.role === 'admin') {
    if (partnerId) where.partnerId = partnerId; // admin-only filter
  } else {
    where.partnerId = user.id;
  }

  const [requests, total] = await Promise.all([
    prisma.visaRequest.findMany({
      where,
      select: {
        id: true,
        applicationNumber: true,
        status: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        sellingPrice: true,
        country: { select: { id: true, name: true } },
        visaProduct: { select: { id: true, name: true, category: true } },
        partner: {
          select: { id: true, email: true, partnerProfile: { select: { companyName: true } } },
        },
        _count: { select: { passengers: { where: { archived: false } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.visaRequest.count({ where }),
  ]);

  return {
    total,
    limit,
    offset,
    requests: requests.map((r) => ({
      id: r.id,
      applicationNumber: r.applicationNumber,
      status: r.status,
      archived: r.archived,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      sellingPrice: r.sellingPrice,
      countryName: r.country.name,
      // Null for requests that predate visa products.
      productName: r.visaProduct?.name ?? null,
      visaCategory: r.visaProduct?.category ?? null,
      agencyName: r.partner.partnerProfile?.companyName ?? null,
      passengerCount: r._count.passengers,
    })),
  };
}

async function getById(id, user) {
  return getDetailForUser(id, user);
}

/**
 * Replace-passengers pattern: archive the old passenger rows (and, since a document upload has
 * no meaning independent of the passenger it was submitted for, archive their uploads
 * alongside), then insert fresh copies — all in one transaction. Allowed only while
 * APPLICATION_SUBMITTED, same reasoning as quotes locking after QUOTE_GENERATED.
 *
 * `passengers` and `markupAmount` are independently optional (visaSchemas.updateVisaRequestSchema
 * requires at least one). Passengers are only replaced when actually supplied — a markup-only
 * edit must not go through the replace-pattern, which would archive every passenger's uploaded
 * documents and reset documentReadiness even though nothing about the passengers changed.
 *
 * sellingPrice is always recomputed from the request's OWN frozen fees — never the live product —
 * using whichever passenger MIX and markup are in effect after this edit (existing values for
 * whichever field wasn't sent). Adding a child to an existing request therefore charges the child
 * rate that applied when the request was created, not today's.
 */
async function update(id, { passengers, markupAmount, visaType }, user) {
  const existing = await getForUser(id, user);

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict(
      `Cannot edit, application already in progress (status: ${existing.status}). ` +
        `Only ${EDITABLE_STATUSES.join('/')} requests can be edited.`
    );
  }

  const effectiveMarkup =
    markupAmount !== undefined ? new Prisma.Decimal(markupAmount) : new Prisma.Decimal(existing.markupAmount);
  const effectivePassengers = passengers !== undefined ? passengers : existing.passengers;
  const { adults, children } = countByType(effectivePassengers);
  const sellingPrice = computeSellingPrice({
    adultFee: existing.adultFeeAtRequest,
    childFee: existing.childFeeAtRequest,
    adults,
    children,
    markupAmount: effectiveMarkup,
  });
  const effectiveVisaType = visaType ?? existing.visaType;

  await prisma.$transaction(async (tx) => {
    if (passengers !== undefined) {
      const oldPassengerIds = existing.passengers.map((p) => p.id);

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
    }

    await tx.visaRequest.update({
      where: { id },
      data: {
        markupAmount: effectiveMarkup,
        sellingPrice,
        visaType: effectiveVisaType,
        evisaDocumentPath: effectiveVisaType === 'E_VISA' ? existing.evisaDocumentPath : null,
      },
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
  const requirement = requiredDocuments.find((d) => d.documentName === documentName);

  if (!requirement) {
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
      data: {
        visaPassengerId: passengerId,
        documentName,
        filePath: relativePath,
        // Taken from the request's own frozen checklist line, not looked up by name again. The file
        // now knows WHAT it is, so "which passport scans are still outstanding" is a query rather
        // than a string comparison that a reworded checklist would break.
        documentTypeId: requirement.documentTypeId ?? null,
      },
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

async function attachEvisaDocument(id, file, user) {
  const existing = await getForUser(id, user);

  if (existing.visaType !== 'E_VISA') {
    throw ApiError.conflict('An eVisa document can only be uploaded for requests marked as E_VISA.');
  }

  if (existing.status !== 'VISA_PROCESSING_STARTED') {
    throw ApiError.conflict(
      `Cannot upload the eVisa document in status ${existing.status}. Only VISA_PROCESSING_STARTED requests can receive it.`
    );
  }

  const relativePath = path
    .join(EVISA_DOCUMENT_UPLOAD_DIR_REL, path.basename(file.path))
    .split(path.sep)
    .join('/');

  await prisma.visaRequest.update({
    where: { id },
    data: { evisaDocumentPath: relativePath },
  });

  return getDetailForUser(id, user);
}

async function getEvisaDocumentFile(id, user) {
  const existing = await getForUser(id, user);

  if (existing.visaType !== 'E_VISA') {
    throw ApiError.notFound('This visa request does not have an eVisa document.');
  }
  if (!existing.evisaDocumentPath) {
    throw ApiError.notFound('No eVisa document has been uploaded for this request.');
  }

  const absolutePath = resolveStoragePath(existing.evisaDocumentPath);
  if (!fs.existsSync(absolutePath)) {
    throw ApiError.notFound('The uploaded eVisa PDF is missing from storage');
  }

  return { absolutePath, visaRequest: existing };
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
  computeSellingPrice,
  computePricingBlock,
  VISA_DOCUMENT_UPLOAD_DIR_REL,
  EVISA_DOCUMENT_UPLOAD_DIR_REL,
  EDITABLE_STATUSES,
  NON_ARCHIVABLE_STATUSES,
  REJECTABLE_STATUSES,
  BASE_REQUIRED_DOCUMENTS,
  attachEvisaDocument,
  getEvisaDocumentFile,
};
