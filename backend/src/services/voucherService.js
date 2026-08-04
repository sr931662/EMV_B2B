const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

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

// Company-wide blocks printed at the foot of every voucher. Looked up by these stable keys so an
// admin can rewrite the wording without a deploy; a missing block is simply omitted.
const TERMS_BLOCK_NAMES = [
  'TERMS_AND_CONDITIONS',
  'SCOPE_OF_SERVICES',
  'HOTEL_AND_LAND_CANCELLATION_POLICY',
  'AMENDMENT_OF_BOOKING_BY_GUEST',
  'GENERAL_NOTES',
];

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
        },
      },
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

  const termsBlocks = await prisma.contentBlock.findMany({
    where: { name: { in: TERMS_BLOCK_NAMES }, archived: false },
    select: { name: true, title: true, body: true },
  });

  // Preserve the declared order rather than whatever the database returned, so the printed page
  // reads in the same sequence every time.
  const terms = TERMS_BLOCK_NAMES.map((name) => termsBlocks.find((b) => b.name === name)).filter(
    Boolean
  );

  const travelDate = new Date(quote.travelDate);

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

    // 3. Full quote details, day-wise
    itinerary: {
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
        // The calendar date this day falls on, so a guest can match the itinerary to their diary.
        ...withDayName(addDays(travelDate, d.dayNumber - 1)),
      })),
    },

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
  };
}

module.exports = { getVoucher, buildStays, ageOn, TERMS_BLOCK_NAMES };
