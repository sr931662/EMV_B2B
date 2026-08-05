const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Unit tests for the logic that decides money, dates and access — the parts where being subtly
 * wrong is expensive and silent.
 *
 * Deliberately NO database and NO network. Everything here is a pure function, so the suite runs in
 * CI on a pull request with nothing provisioned. The database-backed paths are exercised by the
 * integration suite, which needs a live DATABASE_URL and is skipped when there is not one.
 */

const cancellationService = require('../src/services/cancellationService');
const countryService = require('../src/services/countryService');
const rateService = require('../src/services/rateService');
const visaProductService = require('../src/services/visaProductService');
const itineraryService = require('../src/services/itineraryService');
const voucherService = require('../src/services/voucherService');
const settingsService = require('../src/services/settingsService');
const { collectProblems, looksLikePlaceholder } = require('../src/utils/validateEnv');

const doc = (category) => ({ category, archived: false });

test('document profile is derived from the checklist, hardest requirement wins', () => {
  const derive = visaProductService.deriveDocumentProfile;

  assert.equal(derive([doc('PASSPORT')]), 'ONLY_PASSPORT');
  // A photo is not a hurdle that changes which visas a traveller can realistically get.
  assert.equal(derive([doc('PASSPORT'), doc('PHOTO')]), 'ONLY_PASSPORT');
  assert.equal(derive([doc('PASSPORT'), doc('BANK_STATEMENT')]), 'PASSPORT_BANK');
  assert.equal(derive([doc('BANK_STATEMENT'), doc('INCOME_TAX_RETURN')]), 'PASSPORT_BANK_ITR');
  assert.equal(derive([doc('INCOME_TAX_RETURN'), doc('PRIOR_VISA')]), 'WITH_PRIOR_VISA');
  assert.equal(derive([]), 'ONLY_PASSPORT');
  // Archived rows are superseded and must not keep a product looking harder than it is.
  assert.equal(derive([doc('PASSPORT'), { category: 'PRIOR_VISA', archived: true }]), 'ONLY_PASSPORT');
});

test('visa-free and visa-on-arrival cannot be applied for', () => {
  assert.equal(visaProductService.isApplicable('VISA_FREE'), false);
  assert.equal(visaProductService.isApplicable('VISA_ON_ARRIVAL'), false);
  assert.equal(visaProductService.isApplicable('E_VISA'), true);
  assert.equal(visaProductService.isApplicable('STICKER_VISA'), true);
});

test('travel-date feasibility counts working days and skips weekends', () => {
  // Thu 6 Aug 2026 -> Mon 10 Aug is two working days (Fri, Mon).
  const travel = new Date('2026-08-10T00:00:00Z');
  const RealDate = Date;

  // Freeze "now" so the assertion does not drift with the clock.
  global.Date = class extends RealDate {
    constructor(...args) {
      return args.length ? super(...args) : super('2026-08-06T00:00:00Z');
    }

    static now() {
      return new RealDate('2026-08-06T00:00:00Z').getTime();
    }
  };

  try {
    const inTime = visaProductService.assessFeasibility({ processingDaysMax: 2 }, travel);
    assert.equal(inTime.status, 'READY_IN_TIME');
    assert.equal(inTime.workingDaysAvailable, 2);
    // Applying by Thursday still delivers by Monday, because the weekend is not working time.
    assert.equal(inTime.applyBy.slice(0, 10), '2026-08-06');

    const tooLate = visaProductService.assessFeasibility({ processingDaysMax: 5 }, travel);
    assert.equal(tooLate.status, 'TOO_LATE');
    assert.equal(tooLate.shortfallDays, 3);

    // A product with no published timeline must never claim it can make a date.
    assert.equal(visaProductService.assessFeasibility({ processingDaysMax: null }, travel).status, 'UNKNOWN');
    assert.equal(visaProductService.assessFeasibility({ processingDaysMax: 3 }, undefined), null);
  } finally {
    global.Date = RealDate;
  }
});

test('hotel stays chain so a guest never loses a night when changing hotel', () => {
  const stays = voucherService.buildStays(
    [
      { id: 'a', hotelName: 'First', nights: 2 },
      { id: 'b', hotelName: 'Second', nights: 3 },
    ],
    new Date('2026-11-05T00:00:00Z')
  );

  assert.equal(stays[0].checkIn.date.slice(0, 10), '2026-11-05');
  assert.equal(stays[0].checkOut.date.slice(0, 10), '2026-11-07');
  // Check-out of one IS check-in of the next.
  assert.equal(stays[1].checkIn.date, stays[0].checkOut.date);
  assert.equal(stays[1].checkOut.date.slice(0, 10), '2026-11-10');
  assert.equal(stays[0].checkIn.day, 'Thursday');
});

test('traveller age is computed on the travel date, not today', () => {
  const travel = new Date('2026-11-05T00:00:00Z');

  // Birthday one day after travel — still 11 on the day that matters.
  assert.equal(voucherService.ageOn(new Date('2014-11-06'), travel), 11);
  assert.equal(voucherService.ageOn(new Date('2014-11-05'), travel), 12);
  // Never negative, even on a nonsense future date of birth.
  assert.equal(voucherService.ageOn(new Date('2030-01-01'), travel), 0);
});

test('TCS is computed from the frozen rate and rounded to paise', () => {
  assert.equal(settingsService.computeTcs(100000, 0).toString(), '0');
  assert.equal(settingsService.computeTcs(100000, 5).toString(), '5000');
  assert.equal(settingsService.computeTcs(12345.67, 5).toString(), '617.28');
});

test('itinerary times are times of day, and end times wrap past midnight', () => {
  assert.equal(itineraryService.formatMinute(570), '09:30');
  // 0 is a real time (midnight), not "unset" — it must not be swallowed.
  assert.equal(itineraryService.formatMinute(0), '00:00');
  assert.equal(itineraryService.formatMinute(null), null);

  assert.equal(itineraryService.formatMinute(itineraryService.endMinute(570, 90)), '11:00');
  assert.equal(itineraryService.formatMinute(itineraryService.endMinute(1380, 120)), '01:00');
  // No duration means no end time, rather than "ends when it starts".
  assert.equal(itineraryService.endMinute(570, null), null);
});

test('a package template has no dates until a departure is supplied', () => {
  assert.equal(itineraryService.resolveDayDate(null, 3), null);

  const day3 = itineraryService.resolveDayDate(new Date('2026-11-05T00:00:00Z'), 3);
  assert.equal(day3.date.slice(0, 10), '2026-11-07');
  assert.equal(day3.day, 'Saturday');
});

test('hotels are laid along the itinerary by night count', () => {
  const byDay = itineraryService.mapHotelsToDays([
    { id: 'h1', nights: 2 },
    { id: 'h2', nights: 3 },
  ]);

  assert.equal(byDay.get(1).id, 'h1');
  assert.equal(byDay.get(2).id, 'h1');
  assert.equal(byDay.get(3).id, 'h2');
  assert.equal(byDay.get(5).id, 'h2');
});

test('config validation catches the mistakes that actually happened', () => {
  const original = { ...process.env };

  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://u:p@host/db';
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.EMAIL_TRANSPORT = 'smtp';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'a@b.com';
    process.env.SMTP_PASS = 'realpassword';
    process.env.SMTP_FROM = 'X <a@b.com>';

    // The trailing slash that blocked every request and looked like a network error.
    process.env.CORS_ORIGIN = 'https://emv-b2b.pages.dev/';
    assert.ok(collectProblems().errors.some((e) => /trailing slash|end with "\/"/i.test(e)));

    process.env.CORS_ORIGIN = 'https://emv-b2b.pages.dev';
    assert.equal(collectProblems().errors.length, 0);

    // Unset CORS means allow-all, which is not acceptable in production.
    delete process.env.CORS_ORIGIN;
    assert.ok(collectProblems().errors.some((e) => /CORS_ORIGIN is not set/.test(e)));
    process.env.CORS_ORIGIN = 'https://emv-b2b.pages.dev';

    // A dev secret in production means a laptop-minted token is valid live.
    process.env.JWT_SECRET = 'dev_local_only_1234567890123456789012345678';
    assert.ok(collectProblems().errors.some((e) => /development value/i.test(e)));
    process.env.JWT_SECRET = 'a'.repeat(40);

    // console transport in production means nobody can register or reset a password.
    process.env.EMAIL_TRANSPORT = 'console';
    assert.ok(collectProblems().errors.some((e) => /console/i.test(e)));
    process.env.EMAIL_TRANSPORT = 'smtp';

    // A half-configured Cloudinary reports uploads as available and then fails.
    process.env.CLOUDINARY_CLOUD_NAME = 'x';
    assert.ok(collectProblems().errors.some((e) => /partly configured/i.test(e)));
    delete process.env.CLOUDINARY_CLOUD_NAME;

    // pool_timeout breaks the schema engine with a misleading P1001.
    process.env.DATABASE_URL = 'postgresql://u:p@host/db?pool_timeout=20';
    assert.ok(collectProblems().warnings.some((w) => /pool_timeout/.test(w)));
  } finally {
    process.env = original;
  }
});

/**
 * The country slug is generated in two places — this function, and the Phase 3 migration's
 * pg_temp.country_slug. If they disagree, rows created before and after the migration get different
 * URLs for the same country and nothing reports it, so the rule is pinned here.
 */
test('country slugs are URL-safe and match the migration rule', () => {
  assert.equal(countryService.slugify('United Arab Emirates'), 'united-arab-emirates');
  assert.equal(countryService.slugify("Côte d'Ivoire"), 'c-te-d-ivoire');
  assert.equal(countryService.slugify('  Spain  '), 'spain');
  assert.equal(countryService.slugify('Trinidad & Tobago'), 'trinidad-tobago');

  // Leading and trailing separators are trimmed, not left dangling — "/-spain-/" is not a URL
  // anyone wants to see, and a trailing hyphen breaks equality against a hand-typed slug.
  assert.equal(countryService.slugify('!!Spain!!'), 'spain');
  assert.equal(countryService.slugify(''), '');
  assert.equal(countryService.slugify(null), '');
});

test('country search haystack covers name, short name and both ISO codes', () => {
  const haystack = countryService.searchTextFor({
    name: 'United Arab Emirates',
    shortName: 'UAE',
    isoAlpha2: 'AE',
    isoAlpha3: 'ARE',
  });

  // The whole point of the merge: "UAE" and "United Arab Emirates" must find the same row, which
  // the old name-matching between Destination and VisaCountry could not do.
  assert.ok(haystack.includes('united arab emirates'));
  assert.ok(haystack.includes('uae'));
  assert.ok(haystack.includes('are'));

  // Missing fields drop out rather than leaving empty gaps that a `contains` search can match on.
  assert.equal(countryService.searchTextFor({ name: 'Spain' }), 'spain');
});

// ---------------------------------------------------------------------------
// Cancellation policies (Phase 4)
//
// This is the arithmetic behind a charge someone disputes, so it is tested at the boundaries rather
// than in the middle of a band where any implementation would agree.
// ---------------------------------------------------------------------------

const tier = (min, max, chargeType, chargeValue, extra = {}) => ({
  id: `${min}-${max}`,
  daysBeforeTravelMin: min,
  daysBeforeTravelMax: max,
  chargeType,
  chargeValue,
  currencyCode: null,
  archived: false,
  ...extra,
});

// 0-7 days: 100%. 7-30: 50%. 30+: 25%.
const STANDARD_TIERS = [
  tier(0, 7, 'PERCENT_OF_TOTAL', 100),
  tier(7, 30, 'PERCENT_OF_TOTAL', 50),
  tier(30, null, 'PERCENT_OF_TOTAL', 25),
];

test('cancellation bands are half-open, so a boundary day falls in exactly one', () => {
  // Exactly 7 days out is in the 7-30 band, not the 0-7 one. An off-by-one here is a charge
  // dispute, not a rendering glitch.
  assert.equal(cancellationService.tierFor(STANDARD_TIERS, 7).chargeValue, 50);
  assert.equal(cancellationService.tierFor(STANDARD_TIERS, 6).chargeValue, 100);
  assert.equal(cancellationService.tierFor(STANDARD_TIERS, 30).chargeValue, 25);
  assert.equal(cancellationService.tierFor(STANDARD_TIERS, 29).chargeValue, 50);

  // The open-ended band catches everything above it.
  assert.equal(cancellationService.tierFor(STANDARD_TIERS, 4000).chargeValue, 25);

  // Cancelling on the day of travel matches the lowest band rather than nothing.
  assert.equal(cancellationService.tierFor(STANDARD_TIERS, 0).chargeValue, 100);
});

test('where bands overlap, the narrower one wins', () => {
  const overlapping = [
    tier(0, null, 'PERCENT_OF_TOTAL', 10),
    tier(0, 5, 'PERCENT_OF_TOTAL', 90),
  ];

  // A specific band added later is far more likely to be the intended answer than a broad one
  // written first, so it takes precedence.
  assert.equal(cancellationService.tierFor(overlapping, 2).chargeValue, 90);
  assert.equal(cancellationService.tierFor(overlapping, 20).chargeValue, 10);
});

test('archived bands are ignored', () => {
  const withArchived = [tier(0, null, 'PERCENT_OF_TOTAL', 10), tier(0, 5, 'PERCENT_OF_TOTAL', 90, { archived: true })];

  assert.equal(cancellationService.tierFor(withArchived, 2).chargeValue, 10);
});

test('cancellation charges are computed per charge type and returned as strings', () => {
  const travelDate = new Date('2026-09-01T00:00:00Z');
  const on = new Date('2026-08-25T00:00:00Z'); // 7 days out -> the 50% band

  const percent = cancellationService.computeCharge({
    tiers: STANDARD_TIERS,
    travelDate,
    on,
    tripValue: '100000.00',
  });

  assert.equal(percent.daysBefore, 7);
  // A string, not a number: a JSON number is an IEEE double and a charge that round-trips through
  // one is not guaranteed to be the charge that was quoted.
  assert.equal(percent.amount, '50000.00');
  assert.equal(typeof percent.amount, 'string');

  const fixed = cancellationService.computeCharge({
    tiers: [tier(0, null, 'FIXED_AMOUNT', 2500, { currencyCode: 'AED' })],
    travelDate,
    on,
    tripValue: '100000.00',
  });

  assert.equal(fixed.amount, '2500.00');
  // A fixed charge carries its own currency; this system must not assume INR.
  assert.equal(fixed.currencyCode, 'AED');

  const free = cancellationService.computeCharge({
    tiers: [tier(0, null, 'NONE', 0)],
    travelDate,
    on,
    tripValue: '100000.00',
  });

  assert.equal(free.amount, '0.00');

  const nights = cancellationService.computeCharge({
    tiers: [tier(0, null, 'NIGHTS', 2)],
    travelDate,
    on,
    tripValue: '100000.00',
    nightlyRate: '4500',
  });

  assert.equal(nights.amount, '9000.00');

  // Without a nightly rate, a nights-based tier still identifies the right band but cannot be
  // priced. That has to read differently from "it costs nothing".
  const unpriceable = cancellationService.computeCharge({
    tiers: [tier(0, null, 'NIGHTS', 2)],
    travelDate,
    on,
    tripValue: '100000.00',
  });

  assert.equal(unpriceable.amount, null);
  assert.equal(unpriceable.chargeable, true);
});

test('a gap in the bands is reported rather than guessed at', () => {
  const gapped = [tier(0, 5, 'PERCENT_OF_TOTAL', 100), tier(10, null, 'PERCENT_OF_TOTAL', 25)];

  const result = cancellationService.computeCharge({
    tiers: gapped,
    travelDate: new Date('2026-09-08T00:00:00Z'),
    on: new Date('2026-09-01T00:00:00Z'), // 7 days out, inside the gap
    tripValue: '100000.00',
  });

  assert.equal(result.chargeable, false);
  assert.equal(result.amount, null);
  assert.match(result.reason, /gap between bands/);
});

test('a travel date in the past is refused rather than charged', () => {
  const result = cancellationService.computeCharge({
    tiers: STANDARD_TIERS,
    travelDate: new Date('2026-08-01T00:00:00Z'),
    on: new Date('2026-08-05T00:00:00Z'),
    tripValue: '100000.00',
  });

  assert.equal(result.chargeable, false);
  assert.equal(result.daysBefore, -4);
  assert.match(result.reason, /has passed/);
});

test('tier validation catches the mistakes that only surface when someone cancels', () => {
  const problems = (tiers) => cancellationService.validateTiers(tiers).map((p) => p.kind);

  assert.deepEqual(problems(STANDARD_TIERS), []);

  // Nothing covers a last-minute cancellation.
  assert.ok(problems([tier(10, null, 'PERCENT_OF_TOTAL', 25)]).includes('gap'));

  // A hole in the middle.
  assert.ok(
    problems([tier(0, 5, 'PERCENT_OF_TOTAL', 100), tier(10, null, 'PERCENT_OF_TOTAL', 25)]).includes('gap')
  );

  // Overlapping bands still resolve, but the admin should know.
  assert.ok(
    problems([tier(0, 10, 'PERCENT_OF_TOTAL', 100), tier(5, null, 'PERCENT_OF_TOTAL', 25)]).includes('overlap')
  );

  // A closed outermost band means cancelling a year ahead matches nothing.
  assert.ok(problems([tier(0, 30, 'PERCENT_OF_TOTAL', 50)]).includes('open-end'));

  // A fixed charge without a currency is not an amount anyone can act on.
  assert.ok(problems([tier(0, null, 'FIXED_AMOUNT', 500)]).includes('currency'));

  // More than the trip is worth.
  assert.ok(problems([tier(0, null, 'PERCENT_OF_TOTAL', 150)]).includes('over-100'));

  assert.deepEqual(problems([]), ['empty']);
});

test('days-before-travel is UTC-only, so a reader timezone cannot move a band', () => {
  // Late evening in one timezone is the next day in another. If this used local dates, a
  // cancellation could fall in a different band depending on who opened the page.
  const late = new Date('2026-08-25T23:30:00Z');
  const early = new Date('2026-08-25T00:30:00Z');
  const travel = new Date('2026-09-01T00:00:00Z');

  assert.equal(cancellationService.daysBetween(late, travel), 7);
  assert.equal(cancellationService.daysBetween(early, travel), 7);
});

// ---------------------------------------------------------------------------
// Rate cards (Phase 5)
//
// This decides what a hotel costs. Every assertion below corresponds to a way of getting that wrong
// that costs real money — pricing the checkout night, picking the season rate over the promotional
// one, or totalling two currencies as though they were one.
// ---------------------------------------------------------------------------

const rate = (overrides = {}) => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  roomType: 'Deluxe',
  mealPlan: 'CP',
  occupancy: 'DOUBLE',
  basis: 'PER_ROOM_PER_NIGHT',
  currencyCode: 'INR',
  taxPercent: null,
  minNights: null,
  maxNights: null,
  blackoutDates: [],
  isPublished: true,
  archived: false,
  vendorId: null,
  ...overrides,
});

test('a stay is priced by nights, and the checkout date is not a night', () => {
  // In on the 1st, out on the 4th, is three nights: the 1st, 2nd and 3rd. Pricing the 4th is the
  // most common off-by-one in hotel billing and overcharges every booking by one night.
  const nights = rateService.nightsBetween('2026-04-01', '2026-04-04');

  assert.equal(nights.length, 3);
  assert.deepEqual(
    nights.map((n) => n.toISOString().slice(0, 10)),
    ['2026-04-01', '2026-04-02', '2026-04-03']
  );

  assert.throws(() => rateService.nightsBetween('2026-04-04', '2026-04-04'), /zero nights/);
  assert.throws(() => rateService.nightsBetween('2026-04-04', '2026-04-01'), /after check-in/);
});

test('rate validity is inclusive at both ends', () => {
  const seasonal = rate({ validFrom: '2026-04-01', validTo: '2026-04-30' });

  // A rate valid "1 to 30 April" covers the 30th. Treating the end as exclusive silently loses the
  // last day of every season.
  assert.equal(rateService.coversNight(seasonal, new Date('2026-04-30T00:00:00Z')), true);
  assert.equal(rateService.coversNight(seasonal, new Date('2026-04-01T00:00:00Z')), true);
  assert.equal(rateService.coversNight(seasonal, new Date('2026-05-01T00:00:00Z')), false);
  assert.equal(rateService.coversNight(seasonal, new Date('2026-03-31T00:00:00Z')), false);
});

test('a blackout date removes a night from an otherwise valid rate', () => {
  const withBlackout = rate({
    validFrom: '2026-04-01',
    validTo: '2026-04-30',
    blackoutDates: ['2026-04-15'],
  });

  assert.equal(rateService.coversNight(withBlackout, new Date('2026-04-14T00:00:00Z')), true);
  assert.equal(rateService.coversNight(withBlackout, new Date('2026-04-15T00:00:00Z')), false);
});

test('the narrowest valid range wins, because that is what an override is', () => {
  const season = rate({ id: 'season', validFrom: '2026-04-01', validTo: '2026-06-30', amount: 5000 });
  const promo = rate({ id: 'promo', validFrom: '2026-04-10', validTo: '2026-04-16', amount: 6500 });

  // Note the promotional rate is DEARER. It still wins: someone loaded a rate for one specific week
  // on purpose, and quietly using the season rate instead would ignore a deliberate decision.
  const picked = rateService.pickRate([season, promo], new Date('2026-04-12T00:00:00Z'), { nights: 2 });
  assert.equal(picked.id, 'promo');

  // Outside the narrow window the season rate applies again.
  assert.equal(
    rateService.pickRate([season, promo], new Date('2026-05-01T00:00:00Z'), { nights: 2 }).id,
    'season'
  );
});

test('equal ranges are broken by price, then by preferred supplier', () => {
  const dear = rate({ id: 'dear', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 6000, vendorId: 'v1' });
  const cheap = rate({ id: 'cheap', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000, vendorId: 'v2' });

  assert.equal(
    rateService.pickRate([dear, cheap], new Date('2026-04-10T00:00:00Z'), { nights: 2 }).id,
    'cheap'
  );

  // Only when the price is identical does supplier preference decide it.
  const sameA = rate({ id: 'a', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000, vendorId: 'v1' });
  const sameB = rate({ id: 'b', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000, vendorId: 'v2' });

  assert.equal(
    rateService.pickRate([sameA, sameB], new Date('2026-04-10T00:00:00Z'), {
      nights: 2,
      preferredVendorIds: new Set(['v2']),
    }).id,
    'b'
  );
});

test('unpublished and archived rates are never quoted', () => {
  const draft = rate({ id: 'draft', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 100, isPublished: false });
  const gone = rate({ id: 'gone', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 100, archived: true });
  const live = rate({ id: 'live', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000 });

  // Both drafts are far cheaper, so if either leaked into the resolver it would always win.
  assert.equal(
    rateService.pickRate([draft, gone, live], new Date('2026-04-10T00:00:00Z'), { nights: 2 }).id,
    'live'
  );
});

test('length-of-stay conditions are judged on the whole stay, not the night', () => {
  const longStayOnly = rate({ validFrom: '2026-04-01', validTo: '2026-04-30', amount: 4000, minNights: 3 });

  // A 3-night minimum does not mean "the third night is cheaper" — it means the rate does not apply
  // at all to a two-night booking.
  assert.equal(rateService.pickRate([longStayOnly], new Date('2026-04-10T00:00:00Z'), { nights: 2 }), null);
  assert.ok(rateService.pickRate([longStayOnly], new Date('2026-04-10T00:00:00Z'), { nights: 3 }));
});

test('a stay straddling a season change is priced per night, not at one end', () => {
  const low = rate({ validFrom: '2026-04-01', validTo: '2026-04-30', amount: 4000 });
  const high = rate({ validFrom: '2026-05-01', validTo: '2026-05-31', amount: 9000 });

  // 29 and 30 April at 4000, 1 May at 9000. Pricing the whole stay at either end's rate would be
  // out by 5000 in one direction or 10000 in the other.
  const result = rateService.priceStay({
    rates: [low, high],
    checkIn: '2026-04-29',
    checkOut: '2026-05-02',
    occupancy: 'DOUBLE',
    roomType: 'Deluxe',
    mealPlan: 'CP',
  });

  assert.equal(result.priced, true);
  assert.equal(result.nights, 3);
  assert.equal(result.total, '17000.00');
  assert.deepEqual(result.breakdown.map((b) => b.total), ['4000.00', '4000.00', '9000.00']);
  // Strings, not numbers — a price that round-trips through an IEEE double is not the price quoted.
  assert.equal(typeof result.total, 'string');
});

test('tax is applied per night and kept separate from the base rate', () => {
  const taxed = rate({ validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000, taxPercent: 12 });

  const result = rateService.priceStay({
    rates: [taxed],
    checkIn: '2026-04-10',
    checkOut: '2026-04-12',
    occupancy: 'DOUBLE',
    roomType: 'Deluxe',
    mealPlan: 'CP',
  });

  assert.equal(result.total, '11200.00');
  assert.equal(result.breakdown[0].amount, '5000.00');
  assert.equal(result.breakdown[0].taxAmount, '600.00');
});

test('a gap in the rate card names the nights it cannot price', () => {
  const partial = rate({ validFrom: '2026-04-01', validTo: '2026-04-10', amount: 5000 });

  const result = rateService.priceStay({
    rates: [partial],
    checkIn: '2026-04-09',
    checkOut: '2026-04-13',
    occupancy: 'DOUBLE',
    roomType: 'Deluxe',
    mealPlan: 'CP',
  });

  assert.equal(result.priced, false);
  // Naming the dates matters: "no rate found" sends someone hunting through a spreadsheet.
  assert.deepEqual(result.uncoveredDates, ['2026-04-11', '2026-04-12']);
});

test('a stay drawing on two currencies is refused rather than added up', () => {
  const inr = rate({ validFrom: '2026-04-01', validTo: '2026-04-10', amount: 5000, currencyCode: 'INR' });
  const usd = rate({ validFrom: '2026-04-11', validTo: '2026-04-20', amount: 60, currencyCode: 'USD' });

  const result = rateService.priceStay({
    rates: [inr, usd],
    checkIn: '2026-04-10',
    checkOut: '2026-04-12',
    occupancy: 'DOUBLE',
    roomType: 'Deluxe',
    mealPlan: 'CP',
  });

  // 5000 + 60 = 5060 is the answer a naive sum gives, and it is nonsense. Converting needs a rate
  // and a date to apply it on, which is a business decision rather than an arithmetic detail.
  assert.equal(result.priced, false);
  assert.deepEqual(result.currencies.sort(), ['INR', 'USD']);
});

test('room type and meal plan match case-insensitively, because rates arrive from spreadsheets', () => {
  const loaded = rate({ validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000, roomType: 'Deluxe ', mealPlan: 'cp' });

  const result = rateService.priceStay({
    rates: [loaded],
    checkIn: '2026-04-10',
    checkOut: '2026-04-11',
    occupancy: 'DOUBLE',
    roomType: 'deluxe',
    mealPlan: 'CP',
  });

  assert.equal(result.priced, true);
});

test('an activity group rate is the whole price; a per-person rate multiplies', () => {
  const perPerson = {
    id: 'adult',
    paxType: 'ADULT',
    transfer: 'SIC',
    validFrom: '2026-04-01',
    validTo: '2026-04-30',
    amount: 1500,
    currencyCode: 'INR',
    minPax: null,
    maxPax: null,
    isPublished: true,
    archived: false,
  };

  const perGroup = { ...perPerson, id: 'group', paxType: 'GROUP', transfer: 'PRIVATE', amount: 6000 };

  const four = rateService.priceActivity({ rates: [perPerson], date: '2026-04-10', paxType: 'ADULT', pax: 4 });
  assert.equal(four.total, '6000.00');
  assert.equal(four.perGroup, false);

  const group = rateService.priceActivity({
    rates: [perGroup],
    date: '2026-04-10',
    paxType: 'GROUP',
    transfer: 'PRIVATE',
    pax: 4,
  });
  // The same 6000, but it does not change when the party grows — that is the point of a group rate.
  assert.equal(group.total, '6000.00');
  assert.equal(group.perGroup, true);

  const six = rateService.priceActivity({
    rates: [perGroup],
    date: '2026-04-10',
    paxType: 'GROUP',
    transfer: 'PRIVATE',
    pax: 6,
  });
  assert.equal(six.total, '6000.00');
});

test('rate card validation catches what only surfaces when someone quotes', () => {
  const kinds = (rates) => rateService.validateRateCard(rates).map((p) => p.kind);

  assert.deepEqual(kinds([]), ['empty']);

  assert.ok(
    kinds([rate({ validFrom: '2026-04-01', validTo: '2026-04-30', amount: 1, isPublished: false })]).includes(
      'unpublished'
    )
  );

  assert.ok(kinds([rate({ validFrom: '2026-04-30', validTo: '2026-04-01', amount: 1 })]).includes('inverted'));

  assert.ok(
    kinds([rate({ validFrom: '2026-04-01', validTo: '2026-04-30', amount: 1, minNights: 5, maxNights: 2 })]).includes(
      'nights'
    )
  );

  // Two identical rates over the same dates are a duplicate load; the resolver would pick one
  // arbitrarily on price and nobody would know the other existed.
  assert.ok(
    kinds([
      rate({ id: 'a', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000 }),
      rate({ id: 'b', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 4000 }),
    ]).includes('duplicate')
  );

  // An overlap of DIFFERENT widths is the intended override and must NOT be reported.
  assert.ok(
    !kinds([
      rate({ id: 'season', validFrom: '2026-04-01', validTo: '2026-06-30', amount: 5000 }),
      rate({ id: 'promo', validFrom: '2026-04-10', validTo: '2026-04-16', amount: 4000 }),
    ]).includes('duplicate')
  );

  assert.ok(
    kinds([
      rate({ id: 'a', validFrom: '2026-04-01', validTo: '2026-04-30', amount: 5000, currencyCode: 'INR' }),
      rate({ id: 'b', validFrom: '2026-05-01', validTo: '2026-05-30', amount: 60, currencyCode: 'USD' }),
    ]).includes('mixed-currency')
  );
});

// ---------------------------------------------------------------------------
// Cold-start resilience
//
// Neon suspends an idle branch, and the first query afterwards fails with P1001 "Can't reach
// database server" — which reads exactly like an outage but is not one. Getting this predicate
// wrong in either direction is expensive: too narrow and users see 500s after every quiet spell,
// too wide and a genuine failure gets retried three times before anyone hears about it.
// ---------------------------------------------------------------------------

test('only errors that mean the query never arrived are retried', () => {
  const { isRetryable } = require('../src/utils/prisma');

  // Connection-level failures. The query never reached the database, so re-running it cannot
  // double-write — that is the whole reason these are safe to retry.
  assert.equal(isRetryable({ code: 'P1001' }), true); // cannot reach the server
  assert.equal(isRetryable({ code: 'P1002' }), true); // reached, but timed out
  assert.equal(isRetryable({ code: 'P1017' }), true); // server closed the connection

  // Real answers from the database. Retrying a constraint violation just fails three times slower.
  assert.equal(isRetryable({ code: 'P2002' }), false); // unique constraint
  assert.equal(isRetryable({ code: 'P2025' }), false); // record not found
  assert.equal(isRetryable({ code: 'P2003' }), false); // foreign key
  assert.equal(isRetryable({ code: 'P1012' }), false); // schema validation

  // Anything that is not a Prisma error at all — a bug in our own code — must surface immediately.
  assert.equal(isRetryable(new TypeError('x is not a function')), false);
  assert.equal(isRetryable({}), false);
  assert.equal(isRetryable(undefined), false);
});

test('placeholder detection recognises the values shipped in .env.example', () => {
  assert.equal(looksLikePlaceholder('replace_with_app_password'), true);
  assert.equal(looksLikePlaceholder('REPLACE_WITH_APP_PASSWORD_FOR_socialmediaemvg'), true);
  assert.equal(looksLikePlaceholder('no-reply@example.com'), true);
  assert.equal(looksLikePlaceholder('an-actual-secret-value'), false);
  assert.equal(looksLikePlaceholder(undefined), false);
});
