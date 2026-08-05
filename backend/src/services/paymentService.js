const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { resolveStoragePath, formatInr } = require('./pdfService');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const afterCommit = require('../utils/afterCommit');
// One-directional dependency: paymentService reads visa readiness/state via visaRequestService.
// visaRequestService never requires this file back, so there is no circular require.
const visaRequestService = require('./visaRequestService');

const PAYMENT_UPLOAD_DIR_REL = path.join('storage', 'payments');

/**
 * Message shown to a partner after submitting payment proof (package or visa alike — this
 * constant is the single shared source of truth for the verification SLA, recorded in
 * PROJECT_SPEC.md so wording never drifts between the two flows).
 */
const VERIFICATION_SLA_MESSAGE =
  'Your payment has been submitted successfully. It is currently pending verification by the ' +
  'TravNexa Global team. Verification usually takes 24 to 48 hours.';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

// A partner may only pay a quote their customer has approved.
const QUOTE_STATUS_PAYABLE = 'CUSTOMER_APPROVED';

// A visa request may only be paid while still a draft — creation's initial status.
const VISA_STATUS_PAYABLE = 'APPLICATION_SUBMITTED';

// Payment statuses that occupy the "one live payment per quote/visa request" slot. REJECTED
// does not block a resubmission (the deal is still alive), and INFO_REQUESTED is superseded by
// a fresh submission rather than blocking it. Mirrored by the partial unique indexes
// `Payment_one_live_payment_per_quote` and `Payment_one_live_payment_per_visa_request`.
const BLOCKING_PAYMENT_STATUSES = ['PENDING_VERIFICATION', 'APPROVED'];

// A payment is only actionable by an admin from these states.
const ADMIN_ACTIONABLE_STATUSES = ['PENDING_VERIFICATION', 'INFO_REQUESTED'];

const QUEUE_INCLUDE = {
  quote: {
    select: {
      id: true,
      status: true,
      leadName: true,
      travelDate: true,
      sellingPrice: true,
      rawPriceAtQuote: true,
      markupAmount: true,
      branding: true,
      package: { select: { id: true, title: true, destination: { select: { name: true } } } },
      partner: {
        select: {
          id: true,
          email: true,
          partnerProfile: { select: { companyName: true, mobile: true, businessEmail: true } },
        },
      },
    },
  },
  visaRequest: {
    select: {
      id: true,
      status: true,
      applicationNumber: true,
      sellingPrice: true,
      markupAmount: true,
      country: { select: { name: true } },
      partner: {
        select: {
          id: true,
          email: true,
          partnerProfile: { select: { companyName: true, mobile: true, businessEmail: true } },
        },
      },
      _count: { select: { passengers: { where: { archived: false } } } },
    },
  },
  verifiedBy: { select: { id: true, email: true } },
};

/**
 * What the PARTNER owes TRAVNEXA — the wholesale amount, never the customer-facing sellingPrice.
 *
 * sellingPrice = wholesale + markupAmount by construction (locked rule 5 / its visa equivalent),
 * so wholesale = sellingPrice - markupAmount recovers the exact wholesale figure without needing
 * a second, type-specific computation (rawPriceAtQuote for packages vs baseFeeAtRequest ×
 * passengerCount for visas) — one formula, no branching, for both payment flows.
 *
 * The markup is the partner's OWN profit, collected from their end customer separately (via the
 * white-label PDF, which still shows sellingPrice — that part is correct and untouched). It must
 * never flow to TravNexa, which is exactly the bug this function fixes: `submitForQuote` and
 * `submitForVisaRequest` used to reconcile the partner's payment against `sellingPrice`, meaning
 * TravNexa's manual-payment flow was effectively asking the partner to hand over their own
 * markup too.
 */
function computeAmountDue(sellingPrice, markupAmount) {
  return new Prisma.Decimal(sellingPrice).minus(new Prisma.Decimal(markupAmount));
}

/**
 * Flattened queue row — what an admin needs to triage without opening each payment.
 *
 * PACKAGE and VISA rows share one stable superset shape (fields meaningless for a given type are
 * null) so the admin queue UI can render both without a type switch: packageTitle/destination/
 * leadName/sellingPrice/quoteStatus are PACKAGE-only; countryName/applicationNumber/
 * passengerCount/visaRequestStatus are VISA-only.
 *
 * `amountDue` (wholesale — what the partner owes TravNexa) is the figure `reconciliationMismatch`
 * is actually checked against; `sellingPrice` is kept alongside it purely as context so an admin
 * can see the full picture (customer-facing total, and by subtraction the partner's markup).
 */
function toQueueRow(payment) {
  const quote = payment.quote;
  const visaRequest = payment.visaRequest;
  const parent = quote ?? visaRequest;

  return {
    paymentId: payment.id,
    type: payment.type,
    agencyName:
      quote?.partner?.partnerProfile?.companyName ??
      visaRequest?.partner?.partnerProfile?.companyName ??
      null,
    agencyContact:
      quote?.partner?.partnerProfile?.mobile ?? visaRequest?.partner?.partnerProfile?.mobile ?? null,
    packageTitle: quote?.package?.title ?? null,
    destination: quote?.package?.destination?.name ?? null,
    leadName: quote?.leadName ?? null,
    sellingPrice: quote?.sellingPrice ?? visaRequest?.sellingPrice ?? null,
    markupAmount: parent?.markupAmount ?? null,
    amountDue: parent ? computeAmountDue(parent.sellingPrice, parent.markupAmount) : null,
    quoteStatus: quote?.status ?? null,
    countryName: visaRequest?.country?.name ?? null,
    applicationNumber: visaRequest?.applicationNumber ?? null,
    passengerCount: visaRequest?._count?.passengers ?? null,
    visaRequestStatus: visaRequest?.status ?? null,
    transactionId: payment.transactionId,
    amount: payment.amount,
    // Both PACKAGE and VISA rows reconcile amount against the parent's wholesale amountDue — see
    // paymentService.submitForQuote and submitForVisaRequest.
    reconciliationMismatch: payment.reconciliationMismatch,
    paymentStatus: payment.status,
    submittedAt: payment.createdAt,
    verifiedAt: payment.verifiedAt,
    verifiedBy: payment.verifiedBy?.email ?? null,
    adminRemarks: payment.adminRemarks,
    archived: payment.archived,
  };
}

// ---------------------------------------------------------------------------
// Partner: submit payment proof for a quote
// ---------------------------------------------------------------------------

/**
 * Records a manual payment against a quote and moves the quote into the verification queue.
 *
 * The Payment insert and both quote status writes happen in one transaction, so payment state
 * and quote state can never desync.
 */
async function submitForQuote(quoteId, { transactionId, amount, notes }, file, user) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { payments: { where: { archived: false } } },
  });

  // Same 404 for "missing" and "not yours" — see quoteService.getForUser.
  if (!quote || quote.partnerId !== user.id) {
    throw ApiError.notFound(`No quote exists with id ${quoteId}`);
  }

  if (quote.status === 'QUOTE_GENERATED') {
    throw ApiError.badRequest(
      'Confirm your customer approved before paying. Call POST /api/quotes/:id/confirm-customer first.'
    );
  }

  // Normally payment is only accepted from CUSTOMER_APPROVED. The one exception is a payment the
  // admin has sent back with INFO_REQUESTED: that deliberately leaves the quote parked in
  // PENDING_VERIFICATION (the deal is still under review, not returned to the partner), yet the
  // partner must still be able to supersede it with a corrected submission. Without this the two
  // rules contradict each other and INFO_REQUESTED becomes a dead end.
  const supersedable = quote.payments.find((p) => p.status === 'INFO_REQUESTED');
  const payable =
    quote.status === QUOTE_STATUS_PAYABLE ||
    (quote.status === 'PENDING_VERIFICATION' && Boolean(supersedable));

  if (!payable) {
    throw ApiError.conflict(
      `Cannot submit payment for a quote in status ${quote.status}. Payment is only accepted from ${QUOTE_STATUS_PAYABLE}` +
        ', or when TravNexa has requested more information about a submitted payment.'
    );
  }

  const blocking = quote.payments.find((p) => BLOCKING_PAYMENT_STATUSES.includes(p.status));
  if (blocking) {
    throw ApiError.conflict(
      `A payment for this quote is already ${blocking.status} (id ${blocking.id}). ` +
        'Wait for verification, or contact TravNexa if it needs changing.'
    );
  }

  // The partner owes TravNexa the WHOLESALE amount only — sellingPrice includes their own
  // markup, which is their profit from their end customer and must never flow to TravNexa (see
  // computeAmountDue). Stored as given, never coerced to the expected figure — partners
  // sometimes pay in parts or round. The mismatch is surfaced to the admin instead of being
  // silently "fixed".
  const expected = computeAmountDue(quote.sellingPrice, quote.markupAmount);
  const paid = new Prisma.Decimal(amount);
  const reconciliationMismatch = !paid.equals(expected);

  const screenshotPath = path
    .join(PAYMENT_UPLOAD_DIR_REL, path.basename(file.path))
    .split(path.sep)
    .join('/');

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        type: 'PACKAGE',
        quoteId,
        transactionId,
        amount: paid,
        notes,
        screenshotPath,
        reconciliationMismatch,
        status: 'PENDING_VERIFICATION',
      },
    });

    // A superseded INFO_REQUESTED payment is archived rather than deleted (locked rule 1).
    await tx.payment.updateMany({
      where: { quoteId, status: 'INFO_REQUESTED', archived: false, id: { not: created.id } },
      data: { archived: true },
    });

    // The quote mirrors payment state. Both writes are recorded so the intended lifecycle is
    // explicit in the code, though only the final value is externally observable.
    await tx.quote.update({ where: { id: quoteId }, data: { status: 'PAYMENT_SUBMITTED' } });
    await tx.quote.update({ where: { id: quoteId }, data: { status: 'PENDING_VERIFICATION' } });

    return created;
  });

  const fullPayment = await getByIdForAdmin(payment.id);

  await afterCommit(
    async () => {
      const { partner, package: pkg } = fullPayment.quote;
      const companyName = partner.partnerProfile?.companyName ?? partner.email;
      const vars = {
        companyName,
        packageTitle: pkg.title,
        amount: formatInr(paid),
        transactionId,
        slaMessage: VERIFICATION_SLA_MESSAGE,
      };

      await emailService.sendTemplatedEmail('package_payment_submitted', partner.email, vars);
      await notificationService.createNotification(
        partner.id,
        'PAYMENT_SUBMITTED',
        `Payment submitted for "${pkg.title}" (${vars.amount}) — pending verification.`
      );

      const admins = await notificationService.listActiveAdminUsers();
      const adminVars = {
        companyName,
        agencyEmail: partner.email,
        packageTitle: pkg.title,
        destination: pkg.destination.name,
        leadName: fullPayment.quote.leadName,
        amount: vars.amount,
        transactionId,
      };
      await Promise.all(
        admins.map((admin) =>
          emailService.sendTemplatedEmail('admin_new_package_order', admin.email, adminVars)
        )
      );
      await notificationService.createNotificationForMany(
        admins.map((a) => a.id),
        'ADMIN_NEW_PACKAGE_ORDER',
        `New package payment submitted by ${companyName} — "${pkg.title}" (${vars.amount}).`
      );
    },
    { label: 'package payment submitted notifications' }
  );

  return {
    payment: fullPayment,
    reconciliationMismatch,
    expectedAmount: expected,
    message: VERIFICATION_SLA_MESSAGE,
  };
}

/**
 * Records a manual payment against a visa request and moves it into the verification queue.
 *
 * Mirrors submitForQuote's shape and lifecycle exactly, with two differences forced by the
 * schema: (1) the payable status is APPLICATION_SUBMITTED, not CUSTOMER_APPROVED, and (2) there
 * is a hard precondition — visaRequestService.getReadiness must report readyToSubmit before any
 * payment is accepted ("validate before submission"). Now that VisaRequest carries its own
 * sellingPrice (fixed per-country fee × passenger count + partner markup, frozen at request
 * creation), reconciliation works exactly like packages: amount is checked against the WHOLESALE
 * amount due (computeAmountDue — sellingPrice minus the partner's own markup), never coerced to
 * it, and never against sellingPrice itself (that would charge the partner their own markup).
 */
async function submitForVisaRequest(visaRequestId, { transactionId, amount, notes }, file, user) {
  const visaRequest = await prisma.visaRequest.findUnique({
    where: { id: visaRequestId },
    include: { payments: { where: { archived: false } } },
  });

  // Same 404 for "missing" and "not yours" — see visaRequestService.getForUser.
  if (!visaRequest || visaRequest.partnerId !== user.id) {
    throw ApiError.notFound(`No visa request exists with id ${visaRequestId}`);
  }

  // Same INFO_REQUESTED-supersede exception as quotes (see submitForQuote) — otherwise a
  // request the admin sent back for more info has no way to receive a corrected payment.
  const supersedable = visaRequest.payments.find((p) => p.status === 'INFO_REQUESTED');
  const payable =
    visaRequest.status === VISA_STATUS_PAYABLE ||
    (visaRequest.status === 'PENDING_VERIFICATION' && Boolean(supersedable));

  if (!payable) {
    throw ApiError.conflict(
      `Cannot submit payment for a visa request in status ${visaRequest.status}. Payment is only accepted from ${VISA_STATUS_PAYABLE}` +
        ', or when TravNexa has requested more information about a submitted payment.'
    );
  }

  // Validate-before-submission gate (Part D): every mandatory document, every passenger.
  const readiness = await visaRequestService.getReadiness(visaRequestId);
  if (!readiness.readyToSubmit) {
    throw ApiError.badRequest(
      'Upload all mandatory documents for every passenger first. ' +
        `Missing: ${JSON.stringify(readiness.missing)}`
    );
  }

  const blocking = visaRequest.payments.find((p) => BLOCKING_PAYMENT_STATUSES.includes(p.status));
  if (blocking) {
    throw ApiError.conflict(
      `A payment for this visa request is already ${blocking.status} (id ${blocking.id}). ` +
        'Wait for verification, or contact TravNexa if it needs changing.'
    );
  }

  // Same reasoning as submitForQuote: the partner owes TravNexa the WHOLESALE amount only
  // (baseFeeAtRequest × passengerCount, recovered here as sellingPrice - markupAmount), never
  // the customer-facing sellingPrice. Stored as given, never coerced to the expected figure —
  // partners legitimately part-pay or round.
  const expected = computeAmountDue(visaRequest.sellingPrice, visaRequest.markupAmount);
  const paid = new Prisma.Decimal(amount);
  const reconciliationMismatch = !paid.equals(expected);

  const screenshotPath = path
    .join(PAYMENT_UPLOAD_DIR_REL, path.basename(file.path))
    .split(path.sep)
    .join('/');

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        type: 'VISA',
        visaRequestId,
        transactionId,
        amount: paid,
        notes,
        screenshotPath,
        reconciliationMismatch,
        status: 'PENDING_VERIFICATION',
      },
    });

    await tx.payment.updateMany({
      where: {
        visaRequestId,
        status: 'INFO_REQUESTED',
        archived: false,
        id: { not: created.id },
      },
      data: { archived: true },
    });

    await tx.visaRequest.update({
      where: { id: visaRequestId },
      data: { status: 'PAYMENT_SUBMITTED' },
    });
    await tx.visaRequest.update({
      where: { id: visaRequestId },
      data: { status: 'PENDING_VERIFICATION' },
    });

    return created;
  });

  const fullPayment = await getByIdForAdmin(payment.id);

  await afterCommit(
    async () => {
      // Renamed on the way out of the destructure: the relation is `country` since the contract
      // step, and every email var below still reads `visaCountry.name`.
      const { partner, country: visaCountry } = fullPayment.visaRequest;
      const companyName = partner.partnerProfile?.companyName ?? partner.email;

      // Passenger names + uploaded document names for the admin's ops email — not carried on
      // QUEUE_INCLUDE (kept lean for the queue list), so fetched separately here.
      const passengers = await prisma.visaPassenger.findMany({
        where: { visaRequestId, archived: false },
        select: {
          fullName: true,
          documentUploads: { where: { archived: false }, select: { documentName: true } },
        },
      });
      const passengerNames = passengers.map((p) => p.fullName).join(', ');
      const uploadedDocs =
        [...new Set(passengers.flatMap((p) => p.documentUploads.map((d) => d.documentName)))].join(
          ', '
        ) || '(none)';

      const submittedDate = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      await emailService.sendTemplatedEmail('visa_request_submitted', partner.email, {
        companyName,
        applicationNumber: fullPayment.visaRequest.applicationNumber,
        countryName: visaCountry.name,
        passengerCount: passengers.length,
        date: submittedDate,
        status: fullPayment.visaRequest.status,
        slaMessage: VERIFICATION_SLA_MESSAGE,
      });
      await notificationService.createNotification(
        partner.id,
        'VISA_REQUEST_SUBMITTED',
        `Payment submitted for visa application ${fullPayment.visaRequest.applicationNumber} (${visaCountry.name}) — pending verification.`
      );

      const admins = await notificationService.listActiveAdminUsers();
      const adminVars = {
        companyName,
        agencyEmail: partner.email,
        applicationNumber: fullPayment.visaRequest.applicationNumber,
        countryName: visaCountry.name,
        passengerCount: passengers.length,
        passengerNames,
        uploadedDocs,
        transactionId,
        amount: formatInr(paid),
      };
      await Promise.all(
        admins.map((admin) =>
          emailService.sendTemplatedEmail('admin_new_visa_request', admin.email, adminVars)
        )
      );
      await notificationService.createNotificationForMany(
        admins.map((a) => a.id),
        'ADMIN_NEW_VISA_REQUEST',
        `New visa payment submitted by ${companyName} — ${fullPayment.visaRequest.applicationNumber} (${visaCountry.name}).`
      );
    },
    { label: 'visa payment submitted notifications' }
  );

  return {
    payment: fullPayment,
    reconciliationMismatch,
    expectedAmount: expected,
    message: VERIFICATION_SLA_MESSAGE,
  };
}

// ---------------------------------------------------------------------------
// Admin: queue + verification
// ---------------------------------------------------------------------------

async function listForAdmin({ status = 'PENDING_VERIFICATION', type, includeArchived = false } = {}) {
  const where = {};
  if (!includeArchived) where.archived = false;
  if (status) where.status = status;
  if (type) where.type = type;

  const payments = await prisma.payment.findMany({
    where,
    include: QUEUE_INCLUDE,
    orderBy: { createdAt: 'desc' }, // newest first
  });

  return payments.map(toQueueRow);
}

async function getByIdForAdmin(id) {
  const payment = await prisma.payment.findUnique({ where: { id }, include: QUEUE_INCLUDE });

  if (!payment) throw ApiError.notFound(`No payment exists with id ${id}`);

  return payment;
}

function assertAdminActionable(payment, action) {
  if (!ADMIN_ACTIONABLE_STATUSES.includes(payment.status)) {
    throw ApiError.conflict(
      `Cannot ${action} a payment in status ${payment.status}. Only ${ADMIN_ACTIONABLE_STATUSES.join(
        '/'
      )} payments can be actioned.`
    );
  }
}

/** Approving is the ONLY thing that confirms a booking (locked rules 3 & 6). */
async function approve(id, adminRemarks, adminUser) {
  const payment = await getByIdForAdmin(id);
  assertAdminActionable(payment, 'approve');

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminRemarks: adminRemarks ?? payment.adminRemarks,
        verifiedById: adminUser.id,
        verifiedAt: new Date(),
      },
    });

    if (p.quoteId) {
      // Trip documents are issued HERE, not at quote time: a voucher references a confirmed
      // booking, and handing out a voucher number for a trip nobody has paid for would make an
      // unconfirmed quote look booked.
      const confirmedQuote = await tx.quote.findUnique({
        where: { id: p.quoteId },
        select: { quoteNumber: true, voucherNumber: true },
      });

      await tx.quote.update({
        where: { id: p.quoteId },
        data: {
          status: 'BOOKING_CONFIRMED',
          // Only on the first confirmation — a second approved payment against the same trip must
          // not re-issue documents the customer already holds.
          ...(confirmedQuote?.voucherNumber
            ? {}
            : {
                voucherNumber: `VCH-${confirmedQuote.quoteNumber.replace(/^TRIP-/, '')}`,
                itineraryNumber: `ITN-${confirmedQuote.quoteNumber.replace(/^TRIP-/, '')}`,
              }),
        },
      });
    } else if (p.visaRequestId) {
      // Brief allows landing on VISA_PROCESSING_STARTED via one hop or two (through an
      // intermediate PAYMENT_APPROVED write). One hop is used: nothing in this codebase ever
      // reads a resting PAYMENT_APPROVED value, and ops begins the instant payment clears.
      await tx.visaRequest.update({
        where: { id: p.visaRequestId },
        data: { status: 'VISA_PROCESSING_STARTED' },
      });
    }

    return p;
  });

  const fullPayment = await getByIdForAdmin(id);

  await afterCommit(
    async () => {
      if (updated.quoteId) {
        const { partner, package: pkg } = fullPayment.quote;
        const companyName = partner.partnerProfile?.companyName ?? partner.email;

        await emailService.sendTemplatedEmail('package_payment_approved', partner.email, {
          companyName,
          packageTitle: pkg.title,
        });
        await notificationService.createNotification(
          partner.id,
          'PAYMENT_APPROVED',
          `Payment approved — booking confirmed for "${pkg.title}".`
        );
      } else if (updated.visaRequestId) {
        const { partner, country: visaCountry, applicationNumber } = fullPayment.visaRequest;
        const companyName = partner.partnerProfile?.companyName ?? partner.email;
        const vars = { companyName, applicationNumber, countryName: visaCountry.name };

        // Both fire together: approving a visa payment lands the request directly on
        // VISA_PROCESSING_STARTED in one hop (see the transaction above), so the partner is
        // told both that the payment cleared and that processing has begun.
        await emailService.sendTemplatedEmail('visa_payment_approved', partner.email, vars);
        await emailService.sendTemplatedEmail('visa_processing_started', partner.email, vars);
        await notificationService.createNotification(
          partner.id,
          'PAYMENT_APPROVED',
          `Payment approved for visa application ${applicationNumber} (${visaCountry.name}).`
        );
        await notificationService.createNotification(
          partner.id,
          'VISA_PROCESSING_STARTED',
          `Visa processing has started for application ${applicationNumber} (${visaCountry.name}).`
        );
      }
    },
    { label: 'payment approved notifications' }
  );

  return fullPayment;
}

/**
 * Rejecting sends the quote back to CUSTOMER_APPROVED (or the visa request back to
 * APPLICATION_SUBMITTED) — never to the corresponding *_REJECTED-style terminal status.
 *
 * The customer still wants the holiday/visa — only the payment proof was unusable (wrong
 * amount, illegible screenshot, transaction not found). Marking the deal rejected outright
 * would kill something still alive and force the partner to rebuild it from scratch. Returning
 * it to the payable state puts it back exactly where a fresh payment is accepted.
 */
async function reject(id, adminRemarks, adminUser) {
  const payment = await getByIdForAdmin(id);
  assertAdminActionable(payment, 'reject');

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminRemarks,
        verifiedById: adminUser.id,
        verifiedAt: new Date(),
      },
    });

    if (p.quoteId) {
      await tx.quote.update({ where: { id: p.quoteId }, data: { status: 'CUSTOMER_APPROVED' } });
    } else if (p.visaRequestId) {
      // Same reasoning as quotes: only the proof was unusable, the application is still alive.
      await tx.visaRequest.update({
        where: { id: p.visaRequestId },
        data: { status: 'APPLICATION_SUBMITTED' },
      });
    }

    return p;
  });

  const fullPayment = await getByIdForAdmin(id);

  await afterCommit(
    async () => {
      if (updated.quoteId) {
        const { partner, package: pkg } = fullPayment.quote;
        const companyName = partner.partnerProfile?.companyName ?? partner.email;

        await emailService.sendTemplatedEmail('package_payment_rejected', partner.email, {
          companyName,
          packageTitle: pkg.title,
          remarks: adminRemarks,
        });
        await notificationService.createNotification(
          partner.id,
          'PAYMENT_REJECTED',
          `Payment rejected for "${pkg.title}": ${adminRemarks}`
        );
      } else if (updated.visaRequestId) {
        const { partner, applicationNumber } = fullPayment.visaRequest;
        const companyName = partner.partnerProfile?.companyName ?? partner.email;

        await emailService.sendTemplatedEmail('visa_payment_rejected', partner.email, {
          companyName,
          applicationNumber,
          remarks: adminRemarks,
        });
        await notificationService.createNotification(
          partner.id,
          'PAYMENT_REJECTED',
          `Payment rejected for visa application ${applicationNumber}: ${adminRemarks}`
        );
      }
    },
    { label: 'payment rejected notifications' }
  );

  return fullPayment;
}

/** Asks the partner for more detail. The quote stays parked in PENDING_VERIFICATION. */
async function requestInfo(id, adminRemarks, adminUser) {
  const payment = await getByIdForAdmin(id);
  assertAdminActionable(payment, 'request info on');

  await prisma.payment.update({
    where: { id },
    data: {
      status: 'INFO_REQUESTED',
      adminRemarks,
      verifiedById: adminUser.id,
      verifiedAt: new Date(),
    },
  });

  const fullPayment = await getByIdForAdmin(id);

  // Step-9 carried-over fix: this previously fired only an in-app notification because no
  // template covered it — payment_info_requested closes that gap for both PACKAGE and VISA.
  await afterCommit(
    async () => {
      const isVisa = Boolean(fullPayment.visaRequest);
      const partner = isVisa ? fullPayment.visaRequest.partner : fullPayment.quote.partner;
      const companyName = partner.partnerProfile?.companyName ?? partner.email;
      const subject = isVisa
        ? `visa application ${fullPayment.visaRequest.applicationNumber}`
        : `"${fullPayment.quote.package.title}"`;

      await emailService.sendTemplatedEmail('payment_info_requested', partner.email, {
        companyName,
        subject,
        remarks: adminRemarks,
      });
      await notificationService.createNotification(
        partner.id,
        'INFO_REQUESTED',
        `TravNexa needs more information about your payment for ${subject}: ${adminRemarks}`
      );
    },
    { label: 'payment info-requested notification' }
  );

  return fullPayment;
}

/** Absolute path of the uploaded proof, for streaming to an admin. */
async function getScreenshotPath(id) {
  const payment = await getByIdForAdmin(id);
  const absolutePath = resolveStoragePath(payment.screenshotPath);

  if (!fs.existsSync(absolutePath)) {
    throw ApiError.notFound('The uploaded file for this payment is missing from storage');
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType =
    ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

  return { absolutePath, contentType, payment };
}

module.exports = {
  submitForQuote,
  submitForVisaRequest,
  listForAdmin,
  getByIdForAdmin,
  approve,
  reject,
  requestInfo,
  getScreenshotPath,
  toQueueRow,
  PAYMENT_UPLOAD_DIR_REL,
  VERIFICATION_SLA_MESSAGE,
  BLOCKING_PAYMENT_STATUSES,
  ADMIN_ACTIONABLE_STATUSES,
};
