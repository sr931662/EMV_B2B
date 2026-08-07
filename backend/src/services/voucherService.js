const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const noteBlockService = require('./noteBlockService');

/**
 * Assembles the post-payment trip voucher: everything printed on the page a customer receives once
 * their booking is confirmed.
 *
 * Read-only and entirely derived. Nothing here is stored as a "voucher" row — the voucher IS the
 * quote, plus its package, payments, travellers and the notes that apply to it, laid out. Storing a
 * rendered copy would mean two sources of truth for what the customer was told.
 *
 * The one thing NOT derived live is money: prices and TCS come from the quote's own frozen columns,
 * never from the live package or the current tax rate.
 */

// Company-wide blocks printed at the foot of every voucher now live in noteBlockService, alongside
// the check that reports which of them nobody has written yet. They used to be a list here, and a
// missing block was omitted with no trace — which is why every voucher so far has printed without
// terms and conditions and nothing said so.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** UTC-only date maths: a voucher date must not shift because of the reader's timezone. */
function addDays(date, days) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function withDayName(date) {
  return { date: date.toISOString(), day: DAY_NAMES[date.getUTCDay()] };
}

/** Age on the travel date, not today — hotel child-occupancy rules are read against the stay. */
function ageOn(dob, onDate) {
  let age = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = onDate.getUTCMonth() - dob.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }

  return Math.max(age, 0);
}

/**
 * Lays the hotels out along the trip, walking sortOrder from the travel date.
 *
 * Check-out of one hotel IS check-in of the next — a guest moving hotels does not lose a night, so
 * the dates chain rather than each being computed independently.
 */
function buildStays(hotels, travelDate) {
  let cursor = new Date(
    Date.UTC(travelDate.getUTCFullYear(), travelDate.getUTCMonth(), travelDate.getUTCDate())
  );

  return hotels.map((hotel) => {
    const checkIn = cursor;
    const checkOut = addDays(cursor, hotel.nights);
    cursor = checkOut;

    return {
      id: hotel.id,
      hotelName: hotel.hotelName,
      hotelCategory: hotel.hotelCategory,
      hotelDescription: hotel.hotelDescription,
      hotelAddress: hotel.hotelAddress,
      hotelPhone: hotel.hotelPhone,
      nights: hotel.nights,
      checkIn: withDayName(checkIn),
      checkOut: withDayName(checkOut),
    };
  });
}

/**
 * The money block.
 *
 * `totalReceived` counts APPROVED payments only. A payment sitting in PENDING_VERIFICATION has not
 * actually been reconciled, and showing it as received would tell a customer their trip is paid for
 * when the finance team has not agreed yet.
 */
function buildPayments(payments, quote) {
  const approved = payments.filter((p) => p.status === 'APPROVED');

  const totalReceived = approved.reduce(
    (sum, p) => sum.plus(new Prisma.Decimal(p.amount)),
    new Prisma.Decimal(0)
  );

  const sellingPrice = new Prisma.Decimal(quote.sellingPrice);
  const tcsAmount = new Prisma.Decimal(quote.tcsAmount);
  const totalPayable = sellingPrice.plus(tcsAmount);

  return {
    sellingPrice,
    tcsRate: new Prisma.Decimal(quote.tcsRate),
    tcsAmount,
    totalPayable,
    totalReceived,
    balanceDue: totalPayable.minus(totalReceived),
    // Newest last: this is read as a history, and a timeline that runs backwards is harder to
    // follow than one that runs the way the events happened.
    timeline: [...payments]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((p) => ({
        id: p.id,
        transactionId: p.transactionId,
        amount: p.amount,
        status: p.status,
        submittedAt: p.createdAt,
        verifiedAt: p.verifiedAt,
        adminRemarks: p.adminRemarks,
        reconciliationMismatch: p.reconciliationMismatch,
      })),
  };
}

/**
 * Reads the itinerary out of the frozen snapshot.
 *
 * Nothing here touches the live package. That is the whole point: this is what the customer was
 * told, and it must not move when someone edits the package afterwards.
 */
function fromSnapshot(snapshot, quote) {
  const doc = snapshot.document;

  return {
    snapshotted: true,
    capturedAt: snapshot.capturedAt,
    schemaVersion: snapshot.schemaVersion,

    countryName: doc.destination?.name ?? null,
    packageTitle: doc.package?.title ?? null,
    days: doc.package?.days ?? null,
    totalNights: doc.package?.nights ?? null,
    tripStart: doc.trip?.tripStart ?? null,
    tripEnd: doc.trip?.tripEnd ?? null,
    stays: doc.stays ?? [],
    inclusions: doc.package?.inclusions ?? null,
    exclusions: doc.package?.exclusions ?? null,
    // The snapshot stores days with their resolved calendar dates nested under `calendar`; the
    // voucher's shape has always had them spread onto the day itself.
    dayWise: (doc.days ?? []).map((d) => ({
      dayNumber: d.dayNumber,
      title: d.title,
      description: d.description,
      brief: d.brief,
      notes: d.notes,
      inclusions: d.inclusions,
      mealsIncluded: d.mealsIncluded ?? [],
      events: d.events ?? [],
      date: d.calendar?.date ?? null,
      day: d.calendar?.day ?? null,
    })),
    visa: doc.visa ?? null,
    // Present so a reader can tell the difference between "no live booking yet" and "the package
    // never planned any travel".
    transportPlan: doc.transportPlan ?? [],
  };

  // A quote created before this phase has no snapshot. `quote` is unused here but kept in the
  // signature so both resolvers read the same way at the call site.
}

/**
 * The pre-snapshot path, for quotes issued before this phase shipped.
 *
 * Reads the package live, which is the old behaviour and the old defect — editing the package still
 * moves these vouchers. Kept rather than backfilled because inventing a snapshot from today's
 * package would claim to record what a customer was told months ago. `snapshotted: false` marks
 * them honestly so a reader knows which kind of record they are looking at.
 */
function fromLivePackage(quote, travelDate) {
  return {
    snapshotted: false,
    capturedAt: null,
    schemaVersion: null,

    countryName: quote.package.destination.name,
    packageTitle: quote.package.title,
    days: quote.package.days,
    totalNights: quote.package.nights,
    tripStart: withDayName(travelDate),
    tripEnd: withDayName(addDays(travelDate, quote.package.nights)),
    stays: buildStays(quote.package.packageHotels, travelDate),
    inclusions: quote.package.inclusions,
    exclusions: quote.package.exclusions,
    dayWise: quote.package.packageDays.map((d) => ({
      dayNumber: d.dayNumber,
      title: d.title,
      description: d.description,
      ...withDayName(addDays(travelDate, d.dayNumber - 1)),
    })),
    visa: null,
    transportPlan: quote.package.packageTransport ?? [],
  };
}

async function getVoucher(quoteId, user) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      package: {
        include: {
          destination: {
            select: {
              id: true,
              name: true,
              generalNotes: true,
              toursAndTransfersNotes: true,
            },
          },
          packageDays: { where: { archived: false }, orderBy: { dayNumber: 'asc' } },
          packageHotels: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
          packageTransport: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
          // Only ever used as the fallback for a quote whose snapshot predates Phase 6.
          cancellationPolicy: {
            include: { tiers: { where: { archived: false }, orderBy: { daysBeforeTravelMin: 'asc' } } },
          },
        },
      },
      snapshot: true,
      travellers: { where: { archived: false }, orderBy: { createdAt: 'asc' } },
      transport: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
      insurance: { where: { archived: false }, orderBy: { createdAt: 'asc' } },
      payments: { where: { archived: false } },
      partner: {
        select: {
          id: true,
          email: true,
          partnerProfile: { select: { companyName: true, mobile: true, officeAddress: true } },
        },
      },
    },
  });

  if (!quote) throw ApiError.notFound(`No quote exists with id ${quoteId}`);

  // Tenancy: a partner may only see their own trips. Mirrors the check in quoteService.
  if (user.role === 'partner' && quote.partnerId !== user.id) {
    throw ApiError.notFound(`No quote exists with id ${quoteId}`);
  }

  const travelDate = new Date(quote.travelDate);

  // Terms come from the snapshot where one captured them, and live only where it did not.
  //
  // Version 1 snapshots predate Phase 6 and hold no terms, so those fall back to the current wording
  // — the same trade the itinerary makes. Reading live for a snapshotted quote would mean an admin
  // rewriting the terms silently changes the document a customer already holds.
  const captured = quote.snapshot?.document;
  const terms = captured?.terms?.length ? captured.terms : await noteBlockService.forVoucher();

  // A version 1 snapshot did not capture the policy at all. That is NOT the same as "no policy
  // applies" — saying so would tell a customer their trip is free to cancel — so the two states are
  // reported separately and the caller decides what to print.
  const cancellation = captured
    ? {
        captured: Object.prototype.hasOwnProperty.call(captured, 'cancellationPolicy'),
        policy: captured.cancellationPolicy ?? null,
      }
    : {
        captured: false,
        policy: quote.package?.cancellationPolicy ?? null,
      };

  // The itinerary comes from the snapshot when there is one, and from the live package only for
  // quotes issued before snapshots existed.
  //
  // This is the fix, and it is deliberately a fallback rather than a backfill: a snapshot invented
  // today from today's package would claim to record what a customer was told months ago, which is
  // worse than admitting the record does not exist. `snapshotted` says which of the two it is.
  const itinerary = quote.snapshot
    ? fromSnapshot(quote.snapshot, quote)
    : fromLivePackage(quote, travelDate);

  return {
    // 1. Trip reference
    trip: {
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      guestName: quote.leadName,
      contactNumber: quote.contactNumber,
      email: quote.email,
      travelDate: withDayName(travelDate),
      guests: {
        adults: quote.adults,
        children: quote.children,
        infants: quote.infants,
        total: quote.adults + quote.children + quote.infants,
      },
      submittedAt: quote.createdAt,
      specialRequests: quote.specialRequests,
      agency: quote.partner.partnerProfile?.companyName ?? null,
    },

    // 2. Payment details
    payment: buildPayments(quote.payments, quote),

    // 3. Full quote details, day-wise — frozen at generation, see `itinerary` above.
    itinerary,

    // 1b. The travel actually booked for this trip. Falls back to the package's PLAN when nothing
    // has been booked yet, so an itinerary sent before ticketing still says what is included
    // rather than showing an empty section.
    transport: {
      booked: quote.transport,
      plan: quote.transport.length === 0 ? quote.package.packageTransport : [],
    },

    // Travel insurance: the policy bought for this trip, with the package's description of what
    // is included alongside it.
    insurance: {
      policies: quote.insurance,
      includedInPackage: quote.package.insuranceDetails,
    },

    // 4. Traveller details
    travellers: quote.travellers.map((t) => ({
      id: t.id,
      fullName: t.fullName,
      type: t.type,
      dob: t.dob,
      age: ageOn(new Date(t.dob), travelDate),
    })),

    // 5. Trip documents. Null until the booking is confirmed — there is nothing to reference before
    // then, and printing a placeholder would look like a real reference.
    documents: {
      voucherNumber: quote.voucherNumber,
      itineraryNumber: quote.itineraryNumber,
      quotePdfPath: quote.pdfPath,
    },

    // 6. Notes and terms
    notes: {
      countryName: quote.package.destination.name,
      countryGeneralNotes: quote.package.destination.generalNotes,
      toursAndTransfers: quote.package.destination.toursAndTransfersNotes,
      terms,
    },

    // 7. Cancellation terms as agreed. `captured: false` means this quote predates snapshotting of
    // the policy, so what is shown is today's version rather than the one that was agreed — the
    // renderer must say so rather than presenting it as the contract.
    cancellation,
  };
}

module.exports = { getVoucher, buildStays, ageOn };
