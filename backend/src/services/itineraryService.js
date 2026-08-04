const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * Assembles the itinerary view: the day-by-day plan for a package, with hotels, scheduled events,
 * meals, per-day inclusions and the visa position for the destination.
 *
 * Read-only and derived, like voucherService. The difference is what it is anchored to:
 *
 *   voucherService  a QUOTE — real dates, real travellers, real money
 *   itineraryService a PACKAGE — a template, with times of day but no dates
 *
 * Pass a travelDate to resolve the template onto a calendar. Without one the itinerary is still
 * complete, it just says "Day 3" instead of "Wednesday 12 November".
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "09:30" from 570. Null stays null — an event with no stated time must not print as 00:00. */
function formatMinute(minute) {
  if (minute === null || minute === undefined) return null;

  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const mins = String(minute % 60).padStart(2, '0');

  return `${hours}:${mins}`;
}

/**
 * End time of an event, wrapped past midnight if a late activity runs over.
 *
 * Returns null when either half is missing rather than assuming a zero duration, because "ends at
 * the same time it starts" is a claim the data did not make.
 */
function endMinute(startMinute, durationMinutes) {
  if (startMinute === null || startMinute === undefined) return null;
  if (durationMinutes === null || durationMinutes === undefined) return null;

  return (startMinute + durationMinutes) % 1440;
}

function toUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** The calendar date a given day number falls on, or null when no travel date was supplied. */
function resolveDayDate(travelDate, dayNumber) {
  if (!travelDate) return null;

  const date = toUtcDay(travelDate);
  date.setUTCDate(date.getUTCDate() + (dayNumber - 1));

  return { date: date.toISOString(), day: DAY_NAMES[date.getUTCDay()] };
}

/** Shapes one event and, recursively, its sub-events. */
function presentEvent(event) {
  return {
    id: event.id,
    sortOrder: event.sortOrder,
    title: event.title,
    description: event.description,
    type: event.type,
    startMinute: event.startMinute,
    durationMinutes: event.durationMinutes,
    startTime: formatMinute(event.startMinute),
    endTime: formatMinute(endMinute(event.startMinute, event.durationMinutes)),
    mealsIncluded: event.mealsIncluded,
    availability: event.availability,
    // Only populated for TRANSFER events; left on the object regardless so the client does not
    // have to branch on type just to read a field.
    transferMode: event.transferMode,
    luggageAllowance: event.luggageAllowance,
    subEvents: (event.subEvents ?? []).map(presentEvent),
  };
}

/**
 * Lays the hotels along the trip so each day knows where the guest sleeps.
 *
 * Same walk as voucherService.buildStays, but keyed by DAY NUMBER rather than by date, because a
 * package has no dates. Returns a map of dayNumber -> hotel.
 */
function mapHotelsToDays(hotels) {
  const byDay = new Map();
  let dayCursor = 1;

  hotels.forEach((hotel) => {
    for (let i = 0; i < hotel.nights; i += 1) {
      byDay.set(dayCursor, hotel);
      dayCursor += 1;
    }
  });

  return byDay;
}

function presentHotel(hotel) {
  return {
    id: hotel.id,
    hotelName: hotel.hotelName,
    hotelCategory: hotel.hotelCategory,
    hotelDescription: hotel.hotelDescription,
    hotelAddress: hotel.hotelAddress,
    coverImageUrl: hotel.coverImageUrl,
    starRating: hotel.starRating,
    mapLink: hotel.mapLink,
    googleRating: hotel.googleRating,
    googleRatingCount: hotel.googleRatingCount,
    checkInTime: formatMinute(hotel.checkInMinute),
    checkOutTime: formatMinute(hotel.checkOutMinute),
    roomType: hotel.roomType,
    mealPlan: hotel.mealPlan,
    // null means "not stated", which the UI must render differently from "non-refundable".
    refundable: hotel.refundable,
    servicesOffered: hotel.servicesOffered,
    nights: hotel.nights,
  };
}

/**
 * The visa position for the destination.
 *
 * Reuses the visa products already in the system rather than restating visa rules on the package:
 * one country's visa facts live in one place, and the itinerary links straight to the product
 * detail page for the rest. Matched on country NAME because destinations and visa countries are
 * separate libraries with no foreign key between them.
 */
async function findVisaInfo(destinationName) {
  const country = await prisma.visaCountry.findFirst({
    where: { name: { equals: destinationName, mode: 'insensitive' }, archived: false },
    select: { id: true, name: true },
  });

  if (!country) return null;

  const products = await prisma.visaProduct.findMany({
    where: { visaCountryId: country.id, archived: false },
    select: {
      id: true,
      name: true,
      category: true,
      entryType: true,
      validityDays: true,
      maxStayDays: true,
      processingDaysMin: true,
      processingDaysMax: true,
    },
    orderBy: [{ processingDaysMax: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  });

  return { countryId: country.id, countryName: country.name, products };
}

async function getPackageItinerary(packageId, { travelDate } = {}) {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: {
      destination: { select: { id: true, name: true, generalNotes: true, toursAndTransfersNotes: true } },
      packageDays: {
        where: { archived: false },
        orderBy: { dayNumber: 'asc' },
        include: {
          events: {
            // Top-level events only; children come back nested under their parent, so including
            // them here as well would render every sub-event twice.
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
    },
  });

  if (!pkg) throw ApiError.notFound(`No package exists with id ${packageId}`);

  const hotelsByDay = mapHotelsToDays(pkg.packageHotels);
  const resolvedTravelDate = travelDate ? new Date(travelDate) : null;

  const days = pkg.packageDays.map((day) => {
    const hotel = hotelsByDay.get(day.dayNumber);

    return {
      // Needed by the admin editor, which addresses events as /packages/days/:dayId/events.
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title,
      brief: day.brief,
      description: day.description,
      notes: day.notes,
      inclusions: day.inclusions,
      coverImageUrl: day.coverImageUrl,
      mealsIncluded: day.mealsIncluded,
      // Null unless a travel date was supplied — a template has no dates of its own.
      calendar: resolveDayDate(resolvedTravelDate, day.dayNumber),
      // Which hotel the guest is in on this day, so the itinerary does not make the reader
      // cross-reference the stay table themselves.
      stayingAt: hotel ? { id: hotel.id, hotelName: hotel.hotelName } : null,
      // Legs the package places on this day, shown inline rather than only in a separate section.
      transport: pkg.packageTransport.filter((t) => t.dayNumber === day.dayNumber),
      events: day.events.map(presentEvent),
    };
  });

  return {
    package: {
      id: pkg.id,
      title: pkg.title,
      days: pkg.days,
      nights: pkg.nights,
      countryName: pkg.destination.name,
      gallery: pkg.gallery,
      inclusions: pkg.inclusions,
      exclusions: pkg.exclusions,
      faqs: pkg.faqs,
      insuranceDetails: pkg.insuranceDetails,
    },
    hotels: pkg.packageHotels.map(presentHotel),
    // The PLAN — what travel is included. Never a flight number: see PackageTransport in
    // schema.prisma for why the actuals live on the quote instead.
    transport: pkg.packageTransport,
    days,
    visa: await findVisaInfo(pkg.destination.name),
    destinationNotes: {
      general: pkg.destination.generalNotes,
      toursAndTransfers: pkg.destination.toursAndTransfersNotes,
    },
  };
}

module.exports = {
  getPackageItinerary,
  formatMinute,
  endMinute,
  mapHotelsToDays,
  resolveDayDate,
};
