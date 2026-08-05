const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * Resolving a rate card into a price.
 *
 * A rate card is a pile of overlapping rows: a season rate, a promotional week carved out of it, a
 * different supplier's version of both, each in its own currency and valid for its own dates. Asking
 * "what does this hotel cost for these nights" means choosing between them, and the choice has to be
 * made the same way every time or two people quoting the same trip get two answers.
 *
 * THE RULES, in the order they apply:
 *   1. Only published, unarchived rates that actually cover the night in question.
 *   2. Occupancy, room type and meal plan must match what was asked for.
 *   3. Length-of-stay conditions must hold for the whole stay.
 *   4. The night must not be blacked out.
 *   5. Of what survives: the NARROWEST validity range wins. A rate loaded for one week is a
 *      deliberate override of the season it sits inside — that is why someone loaded it.
 *   6. Tie broken by the lower price, then by the preferred supplier. Cheaper first because a tie
 *      means two suppliers genuinely offer the same thing, and preference is a habit rather than a
 *      commercial reason.
 *
 * Money is returned as STRINGS throughout, for the reason quoteSnapshotService gives: a JSON number
 * is an IEEE double and a price that round-trips through one is not the price that was quoted.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC midnight for a date, so a rate boundary cannot move with the reader's timezone. */
function utcDay(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The nights of a stay.
 *
 * A stay checking in on the 1st and out on the 4th is three NIGHTS: the 1st, 2nd and 3rd. The
 * checkout date is not a night and must not be priced, which is the single most common off-by-one
 * in hotel pricing.
 */
function nightsBetween(checkIn, checkOut) {
  const from = utcDay(checkIn);
  const to = utcDay(checkOut);
  const count = Math.round((to - from) / MS_PER_DAY);

  if (count <= 0) {
    throw ApiError.badRequest('Check-out must be after check-in — a stay of zero nights has no price.');
  }

  return Array.from({ length: count }, (_, i) => new Date(from.getTime() + i * MS_PER_DAY));
}

function coversNight(rate, night) {
  const from = utcDay(rate.validFrom);
  const to = utcDay(rate.validTo);

  // Inclusive at both ends, as documented on HotelRate.
  if (night < from || night > to) return false;

  return !(rate.blackoutDates ?? []).some((d) => utcDay(d).getTime() === night.getTime());
}

function rangeWidth(rate) {
  return Math.round((utcDay(rate.validTo) - utcDay(rate.validFrom)) / MS_PER_DAY) + 1;
}

/**
 * Picks one rate from the candidates for a single night.
 *
 * Exported because it is the rule everything else depends on, and a rule that cannot be tested in
 * isolation is a rule nobody can be sure of.
 */
function pickRate(candidates, night, { nights, preferredVendorIds = new Set() } = {}) {
  const eligible = candidates.filter((rate) => {
    if (rate.archived || !rate.isPublished) return false;
    if (!coversNight(rate, night)) return false;

    // Length-of-stay conditions are a property of the STAY, not of the night, so they are checked
    // against the whole booking. A 3-night minimum does not mean "the third night is cheaper".
    if (rate.minNights !== null && rate.minNights !== undefined && nights < rate.minNights) return false;
    if (rate.maxNights !== null && rate.maxNights !== undefined && nights > rate.maxNights) return false;

    return true;
  });

  if (eligible.length === 0) return null;

  return eligible.reduce((best, rate) => {
    const byWidth = rangeWidth(rate) - rangeWidth(best);
    if (byWidth !== 0) return byWidth < 0 ? rate : best;

    const byPrice = Number(rate.amount) - Number(best.amount);
    if (byPrice !== 0) return byPrice < 0 ? rate : best;

    const ratePreferred = preferredVendorIds.has(rate.vendorId);
    const bestPreferred = preferredVendorIds.has(best.vendorId);
    if (ratePreferred !== bestPreferred) return ratePreferred ? rate : best;

    return best;
  });
}

/**
 * Prices a stay, night by night.
 *
 * Night by night rather than "find the rate for this stay" because a stay routinely straddles a
 * season change, and pricing it at one end's rate is wrong by whatever the seasons differ by. This
 * is also why the result reports a breakdown: a partner disputing a total needs to see which night
 * cost what.
 *
 * Returns `priced: false` with the uncovered nights rather than throwing. A gap in a rate card is an
 * operations problem to fix, and the caller needs to know exactly which nights are missing.
 */
function priceStay({ rates, checkIn, checkOut, occupancy, roomType, mealPlan, preferredVendorIds = new Set() }) {
  const nights = nightsBetween(checkIn, checkOut);

  const matching = rates.filter((rate) => {
    if (occupancy && rate.occupancy !== occupancy) return false;
    // Room type and meal plan are free text on both sides, so compared case-insensitively and
    // trimmed. An exact match would fail on "Deluxe " from a pasted spreadsheet.
    if (roomType && rate.roomType?.trim().toLowerCase() !== roomType.trim().toLowerCase()) return false;
    if (mealPlan && rate.mealPlan?.trim().toLowerCase() !== mealPlan.trim().toLowerCase()) return false;

    return true;
  });

  const breakdown = [];
  const uncovered = [];
  const currencies = new Set();

  for (const night of nights) {
    const rate = pickRate(matching, night, { nights: nights.length, preferredVendorIds });

    if (!rate) {
      uncovered.push(night.toISOString().slice(0, 10));
      continue;
    }

    currencies.add(rate.currencyCode);

    const base = Number(rate.amount);
    const tax = rate.taxPercent ? (base * Number(rate.taxPercent)) / 100 : 0;

    breakdown.push({
      date: night.toISOString().slice(0, 10),
      rateId: rate.id,
      vendorId: rate.vendorId,
      basis: rate.basis,
      amount: base.toFixed(2),
      taxPercent: rate.taxPercent === null || rate.taxPercent === undefined ? null : String(rate.taxPercent),
      taxAmount: tax.toFixed(2),
      total: (base + tax).toFixed(2),
      currencyCode: rate.currencyCode,
    });
  }

  if (uncovered.length > 0) {
    return {
      priced: false,
      nights: nights.length,
      uncoveredDates: uncovered,
      reason:
        `No published rate covers ${uncovered.length} of ${nights.length} night(s). ` +
        'Load a rate for those dates, or publish one that is already loaded.',
      breakdown,
    };
  }

  // Several currencies across one stay cannot be added up here — that needs an exchange rate and a
  // date to apply it on, which is a decision the business makes, not an arithmetic detail. Reported
  // rather than guessed at.
  if (currencies.size > 1) {
    return {
      priced: false,
      nights: nights.length,
      reason: `This stay draws on rates in ${[...currencies].join(' and ')}. Convert them to one currency before quoting.`,
      currencies: [...currencies],
      breakdown,
    };
  }

  const total = breakdown.reduce((sum, line) => sum + Number(line.total), 0);

  return {
    priced: true,
    nights: nights.length,
    currencyCode: [...currencies][0],
    total: total.toFixed(2),
    // Per-night rather than a single figure, because a stay that straddles a season change has no
    // single nightly rate and rounding one out of the total invents a number.
    breakdown,
  };
}

/** Loads a hotel's live rates and prices a stay against them. */
async function priceHotelStay(hotelId, { checkIn, checkOut, occupancy, roomType, mealPlan, vendorId } = {}) {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { id: true, name: true, archived: true },
  });

  if (!hotel) throw ApiError.notFound(`No hotel exists with id ${hotelId}`);

  const [rates, contracts] = await Promise.all([
    prisma.hotelRate.findMany({
      where: {
        hotelId,
        archived: false,
        isPublished: true,
        ...(vendorId ? { vendorId } : {}),
        // Coarse date filter in SQL so the whole rate card does not come back for a 3-night stay.
        // The precise per-night decision still happens in pickRate.
        validTo: { gte: utcDay(checkIn) },
        validFrom: { lte: utcDay(checkOut) },
      },
    }),
    prisma.hotelVendor.findMany({
      where: { hotelId, archived: false, isPreferred: true },
      select: { vendorId: true },
    }),
  ]);

  const result = priceStay({
    rates,
    checkIn,
    checkOut,
    occupancy,
    roomType,
    mealPlan,
    preferredVendorIds: new Set(contracts.map((c) => c.vendorId)),
  });

  return { hotel: { id: hotel.id, name: hotel.name }, ...result };
}

/**
 * The price of an activity for a party on a date.
 *
 * Simpler than a hotel because there is one date rather than a range, but the same narrowest-range
 * rule applies for the same reason.
 */
function priceActivity({ rates, date, paxType = 'ADULT', transfer, pax = 1 }) {
  const day = utcDay(date);

  const eligible = rates.filter((rate) => {
    if (rate.archived || !rate.isPublished) return false;
    if (rate.paxType !== paxType) return false;
    if (transfer && rate.transfer !== transfer) return false;
    if (day < utcDay(rate.validFrom) || day > utcDay(rate.validTo)) return false;

    // A GROUP rate covers a band of headcounts for one price; a per-person rate uses the same
    // columns to express a minimum booking size.
    if (rate.minPax !== null && rate.minPax !== undefined && pax < rate.minPax) return false;
    if (rate.maxPax !== null && rate.maxPax !== undefined && pax > rate.maxPax) return false;

    return true;
  });

  if (eligible.length === 0) {
    return {
      priced: false,
      reason: `No published ${paxType.toLowerCase()} rate covers ${day.toISOString().slice(0, 10)} for ${pax} pax.`,
    };
  }

  const chosen = eligible.reduce((best, rate) => {
    const byWidth = rangeWidth(rate) - rangeWidth(best);
    if (byWidth !== 0) return byWidth < 0 ? rate : best;

    return Number(rate.amount) < Number(best.amount) ? rate : best;
  });

  // A group rate is already the whole price; a per-person rate multiplies.
  const total = chosen.paxType === 'GROUP' ? Number(chosen.amount) : Number(chosen.amount) * pax;

  return {
    priced: true,
    rateId: chosen.id,
    unitAmount: Number(chosen.amount).toFixed(2),
    pax,
    perGroup: chosen.paxType === 'GROUP',
    total: total.toFixed(2),
    currencyCode: chosen.currencyCode,
    transfer: chosen.transfer,
  };
}

async function priceActivityOn(activityId, { date, paxType, transfer, pax } = {}) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { id: true, name: true },
  });

  if (!activity) throw ApiError.notFound(`No activity exists with id ${activityId}`);

  const rates = await prisma.activityRate.findMany({
    where: { activityId, archived: false, isPublished: true },
  });

  return { activity, ...priceActivity({ rates, date, paxType, transfer, pax }) };
}

/**
 * Problems in a rate card that only surface when someone tries to quote.
 *
 * Same purpose as cancellationService.validateTiers: a rate card is loaded weeks before it is used,
 * and the day it is used is the worst time to discover the season has a hole in it.
 */
function validateRateCard(rates, { from, to } = {}) {
  const live = rates.filter((r) => !r.archived);
  const problems = [];

  if (live.length === 0) return [{ kind: 'empty', message: 'This hotel has no rates, so it cannot be quoted.' }];

  const unpublished = live.filter((r) => !r.isPublished).length;
  if (unpublished === live.length) {
    problems.push({
      kind: 'unpublished',
      message: `All ${live.length} rate(s) are unpublished, so none of them can be quoted yet.`,
    });
  }

  live.forEach((rate) => {
    if (utcDay(rate.validTo) < utcDay(rate.validFrom)) {
      problems.push({
        kind: 'inverted',
        message: `A rate valid from ${String(rate.validFrom).slice(0, 10)} to ${String(rate.validTo).slice(0, 10)} never applies.`,
      });
    }

    if (
      rate.minNights !== null &&
      rate.maxNights !== null &&
      rate.minNights !== undefined &&
      rate.maxNights !== undefined &&
      rate.minNights > rate.maxNights
    ) {
      problems.push({
        kind: 'nights',
        message: `A rate needing at least ${rate.minNights} nights but at most ${rate.maxNights} can never apply.`,
      });
    }
  });

  // Two published rates that are identical in every dimension AND overlap in dates are a duplicate
  // load, not a deliberate override — the resolver would pick one arbitrarily on price.
  const published = live.filter((r) => r.isPublished);

  for (let i = 0; i < published.length; i += 1) {
    for (let j = i + 1; j < published.length; j += 1) {
      const a = published[i];
      const b = published[j];

      const sameShape =
        a.occupancy === b.occupancy &&
        a.roomType?.trim().toLowerCase() === b.roomType?.trim().toLowerCase() &&
        a.mealPlan?.trim().toLowerCase() === b.mealPlan?.trim().toLowerCase() &&
        a.vendorId === b.vendorId;

      const overlaps = utcDay(a.validFrom) <= utcDay(b.validTo) && utcDay(b.validFrom) <= utcDay(a.validTo);
      const sameRange = rangeWidth(a) === rangeWidth(b);

      // Overlapping ranges of DIFFERENT widths are the intended override and are not reported.
      if (sameShape && overlaps && sameRange) {
        problems.push({
          kind: 'duplicate',
          message: `Two identical ${a.roomType} / ${a.mealPlan} rates cover the same dates. One of them will be ignored.`,
        });
      }
    }
  }

  // Currencies mixed within one room type mean a stay straddling them cannot be totalled.
  const byRoom = new Map();
  published.forEach((r) => {
    const key = `${r.roomType?.trim().toLowerCase()}|${r.occupancy}`;
    byRoom.set(key, (byRoom.get(key) ?? new Set()).add(r.currencyCode));
  });

  byRoom.forEach((currencies, key) => {
    if (currencies.size > 1) {
      problems.push({
        kind: 'mixed-currency',
        message: `${key.split('|')[0]} is priced in ${[...currencies].join(' and ')}. A stay crossing both cannot be totalled.`,
      });
    }
  });

  return problems;
}

module.exports = {
  nightsBetween,
  coversNight,
  pickRate,
  priceStay,
  priceHotelStay,
  priceActivity,
  priceActivityOn,
  validateRateCard,
};
