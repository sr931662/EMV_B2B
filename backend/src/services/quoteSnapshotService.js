const prisma = require('../utils/prisma');
const noteBlockService = require('./noteBlockService');

/**
 * Captures what a quote promised, at the instant it was promised.
 *
 * Phase 1 of the Library MDM migration, and the piece everything else depends on. Until this
 * existed, a quote froze only its price while the voucher read the package live — so editing a
 * package rewrote vouchers customers already held. Nothing can safely start REFERENCING the library
 * instead of copying from it until this boundary is in place.
 *
 * Two rules govern everything below:
 *
 *   1. Resolve completely. A snapshot containing an id is not a snapshot — it is a pointer to
 *      something that can still change. Every value is materialised.
 *   2. Never update. The row is written once, in the transaction that creates the quote. There is
 *      no edit path on purpose: a promise that can be rewritten is not a record.
 */

// Bump when the document's SHAPE changes, not when a field's value changes. The voucher resolver
// branches on this so old snapshots keep rendering rather than erroring on a section that did not
// exist when they were captured.
// Version 2 adds `cancellationPolicy` and `terms` (Phase 6). Version 1 documents simply lack them,
// which the voucher resolver treats as "not captured" rather than "none applies" — a distinction
// that matters, because the alternative is telling a customer their trip is free to cancel.
const SCHEMA_VERSION = 2;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** UTC-only, so a snapshot does not shift by a day depending on who reads it from where. */
function toUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  const next = toUtcDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function withDayName(date) {
  return { date: date.toISOString(), day: DAY_NAMES[date.getUTCDay()] };
}

/** "09:30" from minutes-past-midnight. Null stays null — no time is not midnight. */
function formatMinute(minute) {
  if (minute === null || minute === undefined) return null;

  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * Decimal columns are serialised as strings, not numbers.
 *
 * JSON numbers are IEEE doubles, and a price that survives a round trip through one is not
 * guaranteed to be the price that was quoted. A string is exact, and the reader parses it back into
 * a Decimal.
 */
function money(value) {
  return value === null || value === undefined ? null : String(value);
}

/** Flattens an event and its sub-events, resolving times as it goes. */
function captureEvent(event) {
  return {
    title: event.title,
    description: event.description,
    type: event.type,
    startTime: formatMinute(event.startMinute),
    durationMinutes: event.durationMinutes,
    mealsIncluded: event.mealsIncluded ?? [],
    availability: event.availability,
    transferMode: event.transferMode,
    luggageAllowance: event.luggageAllowance,
    subEvents: (event.subEvents ?? []).map(captureEvent),
  };
}

/**
 * Lays the hotels along the trip from the travel date, so the snapshot records real check-in and
 * check-out dates rather than a night count someone has to re-derive later.
 *
 * Check-out of one hotel is check-in of the next: a guest changing hotel does not lose a night.
 */
function captureStays(hotels, travelDate) {
  let cursor = toUtcDay(travelDate);

  return hotels.map((hotel) => {
    const checkIn = cursor;
    const checkOut = addDays(cursor, hotel.nights);
    cursor = checkOut;

    return {
      hotelName: hotel.hotelName,
      hotelCategory: hotel.hotelCategory,
      hotelDescription: hotel.hotelDescription,
      hotelAddress: hotel.hotelAddress,
      coverImageUrl: hotel.coverImageUrl,
      starRating: hotel.starRating,
      mapLink: hotel.mapLink,
      googleRating: hotel.googleRating === null || hotel.googleRating === undefined ? null : String(hotel.googleRating),
      googleRatingCount: hotel.googleRatingCount,
      checkInTime: formatMinute(hotel.checkInMinute),
      checkOutTime: formatMinute(hotel.checkOutMinute),
      roomType: hotel.roomType,
      mealPlan: hotel.mealPlan,
      refundable: hotel.refundable,
      servicesOffered: hotel.servicesOffered,
      nights: hotel.nights,
      checkIn: withDayName(checkIn),
      checkOut: withDayName(checkOut),
    };
  });
}

/**
 * Reads everything a quote resolves to and returns the document to store.
 *
 * Takes a transaction client so it runs inside the quote's own transaction — if this throws, the
 * quote is not created either. A quote without a snapshot would be a promise nobody recorded, which
 * is the exact hole this phase closes.
 */
/**
 * The company-wide blocks a voucher prints, as they read right now.
 *
 * Read through noteBlockService so there is one definition of which blocks a document needs, rather
 * than a second list here that drifts from it.
 */
async function captureTerms(tx) {
  const blocks = await noteBlockService.forVoucher(tx);

  return blocks.map((block) => ({ key: block.key, title: block.title, body: block.body }));
}

async function buildDocument(tx, { quoteId, packageId, travelDate }) {
  const pkg = await tx.package.findUnique({
    where: { id: packageId },
    include: {
      destination: true,
      packageDays: {
        where: { archived: false },
        orderBy: { dayNumber: 'asc' },
        include: {
          events: {
            where: { archived: false, parentEventId: null },
            orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
            include: {
              subEvents: {
                where: { archived: false },
                orderBy: [{ startMinute: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
              },
            },
          },
        },
      },
      packageHotels: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
      packageTransport: { where: { archived: false }, orderBy: { sortOrder: 'asc' } },
      // Phase 6: the cancellation terms in force at this instant. Without this the tiers stay live,
      // and rewriting a policy would silently change what a customer who has already paid owes if
      // they cancel — the same class of bug Phase 1 fixed for the itinerary and the price.
      cancellationPolicy: {
        include: { tiers: { where: { archived: false }, orderBy: { daysBeforeTravelMin: 'asc' } } },
      },
    },
  });

  const travel = toUtcDay(new Date(travelDate));

  // The visa position for the destination, resolved through its country. Used to be a separate
  // visaCountryId link, matched or unmatched independently of countryId; the contract-step
  // migration retired that column, so this now reads the one hierarchy link every destination has.
  const visaCountry = pkg.destination.countryId
    ? await tx.country.findUnique({
        where: { id: pkg.destination.countryId },
        select: { id: true, name: true },
      })
    : null;

  const visaProducts = visaCountry
    ? await tx.visaProduct.findMany({
        where: { countryId: visaCountry.id, archived: false },
        select: {
          name: true,
          category: true,
          entryType: true,
          validityDays: true,
          maxStayDays: true,
          processingDaysMin: true,
          processingDaysMax: true,
        },
        orderBy: [{ processingDaysMax: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      })
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    quoteId,

    destination: {
      name: pkg.destination.name,
      shortName: pkg.destination.shortName,
      coverImageUrl: pkg.destination.coverImageUrl,
      flagImageUrl: pkg.destination.flagImageUrl,
      aboutDestination: pkg.destination.aboutDestination,
      generalNotes: pkg.destination.generalNotes,
      toursAndTransfersNotes: pkg.destination.toursAndTransfersNotes,
    },

    package: {
      title: pkg.title,
      days: pkg.days,
      nights: pkg.nights,
      inclusions: pkg.inclusions,
      exclusions: pkg.exclusions,
      faqs: pkg.faqs,
      insuranceDetails: pkg.insuranceDetails,
      gallery: pkg.gallery,
    },

    trip: {
      travelDate: withDayName(travel),
      tripStart: withDayName(travel),
      tripEnd: withDayName(addDays(travel, pkg.nights)),
    },

    stays: captureStays(pkg.packageHotels, travel),

    // Each day carries the calendar date it falls on, resolved here so the voucher never has to
    // recompute it against a travel date that could itself have been edited.
    days: pkg.packageDays.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.title,
      brief: day.brief,
      description: day.description,
      notes: day.notes,
      inclusions: day.inclusions,
      coverImageUrl: day.coverImageUrl,
      mealsIncluded: day.mealsIncluded ?? [],
      calendar: withDayName(addDays(travel, day.dayNumber - 1)),
      events: day.events.map(captureEvent),
    })),

    // The travel the package PLANS. What was actually booked lives on QuoteTransport, which is
    // per-trip data and is read live because it is edited after the quote is issued.
    transportPlan: pkg.packageTransport.map((t) => ({
      mode: t.mode,
      fromCity: t.fromCity,
      toCity: t.toCity,
      dayNumber: t.dayNumber,
      classOfService: t.classOfService,
      notes: t.notes,
    })),

    visa: visaCountry
      ? { countryName: visaCountry.name, products: visaProducts }
      : null,

    // Frozen with everything else. `chargeValue` is a string for the reason money always is here:
    // a JSON number is an IEEE double, and a cancellation charge that round-trips through one is
    // not the charge that was agreed.
    cancellationPolicy: pkg.cancellationPolicy
      ? {
          name: pkg.cancellationPolicy.name,
          description: pkg.cancellationPolicy.description,
          notes: pkg.cancellationPolicy.notes,
          tiers: pkg.cancellationPolicy.tiers.map((tier) => ({
            daysBeforeTravelMin: tier.daysBeforeTravelMin,
            daysBeforeTravelMax: tier.daysBeforeTravelMax,
            chargeType: tier.chargeType,
            chargeValue: money(tier.chargeValue),
            currencyCode: tier.currencyCode,
          })),
        }
      : null,

    // Company-wide prose, captured because it is printed on the voucher and an admin may rewrite it
    // between the quote being issued and the customer reading their copy.
    terms: await captureTerms(tx),

    pricing: {
      // Duplicated from the quote's own columns on purpose: the document must be readable on its
      // own, without joining back to a row that could later be corrected.
      rawPriceAtQuote: null,
      childRawPriceAtQuote: null,
      sellingPrice: null,
      tcsRate: null,
      tcsAmount: null,
    },
  };
}

/**
 * Builds and stores the snapshot. Call inside the quote's creation transaction.
 *
 * `pricing` is passed in rather than read back, because at this point the quote row is being
 * written in the same transaction and the caller already holds the exact Decimals.
 */
async function capture(tx, { quoteId, packageId, travelDate, pricing }) {
  const document = await buildDocument(tx, { quoteId, packageId, travelDate });

  document.pricing = {
    rawPriceAtQuote: money(pricing.rawPriceAtQuote),
    childRawPriceAtQuote: money(pricing.childRawPriceAtQuote),
    sellingPrice: money(pricing.sellingPrice),
    markupAmount: money(pricing.markupAmount),
    tcsRate: money(pricing.tcsRate),
    tcsAmount: money(pricing.tcsAmount),
  };

  return tx.quoteSnapshot.create({
    data: { quoteId, schemaVersion: SCHEMA_VERSION, document },
  });
}

module.exports = { capture, buildDocument, SCHEMA_VERSION };
