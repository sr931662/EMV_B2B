const { z } = require('zod');
const { withBrandGuard } = require('./brandGuard');
const { paginationFields } = require('./paginationSchema');

// Decimal(12,2) in the schema -> max 9,999,999,999.99
const MAX_PRICE = 9999999999.99;

const uuidField = (label) => z.uuid(`${label} must be a valid UUID`);

const requiredText = (label, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

// The package title is reproduced verbatim inside partner white-label PDFs, so it may not
// carry EMV branding (locked rule 4b).
const packageTitleField = withBrandGuard(requiredText('title'), 'Package title');

// Shared by both per-head price fields — `label` only changes the error text ("adultRawPrice" vs
// "childRawPrice"), the constraints are identical.
const priceField = (label) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(MAX_PRICE, `${label} must be at most ${MAX_PRICE}`)
    .refine((v) => Math.round(v * 100) / 100 === v, `${label} may have at most 2 decimal places`);

const requiredPriceField = (label) =>
  z.coerce
    .number({ error: `${label} is required and must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(MAX_PRICE, `${label} must be at most ${MAX_PRICE}`)
    .refine((v) => Math.round(v * 100) / 100 === v, `${label} may have at most 2 decimal places`);

const stringArray = (label, maxLen = 1000, maxItems = 50) =>
  z
    .array(z.string().trim().min(1, `${label} entries cannot be empty`).max(maxLen), {
      error: `${label} must be an array of strings`,
    })
    .max(maxItems, `${label} may have at most ${maxItems} entries`);

// Ordered list — position in the array becomes PackageDay.dayNumber (1-based). Duplicates are
// allowed on purpose: repeating "Day at leisure" across a trip is legitimate, and each
// occurrence becomes its own independent copy.
const dayTemplateIdsField = z
  .array(uuidField('dayTemplateIds entry'), { error: 'dayTemplateIds must be an array of UUIDs' })
  .min(1, 'dayTemplateIds must contain at least one day template')
  .max(60, 'dayTemplateIds may have at most 60 entries');

const hotelIdsField = z
  .array(uuidField('hotelIds entry'), { error: 'hotelIds must be an array of UUIDs' })
  .max(30, 'hotelIds may have at most 30 entries');

const idParamSchema = z.object({ id: uuidField('id') });

/**
 * Phase 6: what the package draws from the library.
 *
 * These are LINKS, not copies, unlike dayTemplateIds and hotelIds above. They record what the
 * package is about — for grouping, filtering and reporting — rather than what the customer was sold.
 * The prose a customer reads is still `inclusions`/`exclusions`, which the builder composes from
 * these items and stores as text, so editing the vocabulary later cannot rewrite an issued quote.
 */
const libraryLinkFields = {
  cancellationPolicyId: uuidField('cancellationPolicyId').nullable().optional(),
  faqIds: z.array(uuidField('faqIds entry')).max(50, 'faqIds may have at most 50 entries').optional(),
  inclusionIds: z
    .array(uuidField('inclusionIds entry'))
    .max(80, 'inclusionIds may have at most 80 entries')
    .optional(),
  exclusionIds: z
    .array(uuidField('exclusionIds entry'))
    .max(80, 'exclusionIds may have at most 80 entries')
    .optional(),
};

const createPackageSchema = z
  .object({
    destinationId: uuidField('destinationId'),
    title: packageTitleField,
    days: z.coerce.number({ error: 'days is required' }).int('days must be a whole number').min(1, 'days must be at least 1').max(60),
    nights: z.coerce
      .number({ error: 'nights is required' })
      .int('nights must be a whole number')
      .min(0, 'nights cannot be negative')
      .max(60),
    adultRawPrice: requiredPriceField('adultRawPrice'),
    // Optional, defaulting to 0 — "children travel free" is the common case, and a package that
    // does charge for children opts in by setting this rather than every package having to state
    // an explicit 0.
    childRawPrice: priceField('childRawPrice').optional().default(0),
    inclusions: requiredText('inclusions', 20000),
    exclusions: requiredText('exclusions', 20000),
    gallery: stringArray('gallery').optional().default([]),
    tags: stringArray('tags', 60, 20).optional().default([]),
    dayTemplateIds: dayTemplateIdsField,
    hotelIds: hotelIdsField.optional().default([]),
    ...libraryLinkFields,
  })
  .strict();

// destinationId is absent: a package does not move between destinations, and moving it would
// orphan its copied days/hotels from the destination they were validated against.
const updatePackageSchema = z
  .object({
    title: packageTitleField.optional(),
    days: z.coerce.number().int('days must be a whole number').min(1).max(60).optional(),
    nights: z.coerce.number().int('nights must be a whole number').min(0).max(60).optional(),
    adultRawPrice: priceField('adultRawPrice').optional(),
    childRawPrice: priceField('childRawPrice').optional(),
    inclusions: requiredText('inclusions', 20000).optional(),
    exclusions: requiredText('exclusions', 20000).optional(),
    gallery: stringArray('gallery').optional(),
    tags: stringArray('tags', 60, 20).optional(),
    dayTemplateIds: dayTemplateIdsField.optional(),
    hotelIds: hotelIdsField.optional(),
    ...libraryLinkFields,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update',
  });

const listPackagesSchema = z
  .object({
    destinationId: uuidField('destinationId').optional(),
    tag: z.string().trim().min(1).max(60).optional(),
    minPrice: z.coerce.number().min(0).max(MAX_PRICE).optional(),
    maxPrice: z.coerce.number().min(0).max(MAX_PRICE).optional(),
    minDays: z.coerce.number().int().min(1).max(60).optional(),
    maxDays: z.coerce.number().int().min(1).max(60).optional(),
    search: z.string().trim().min(1).max(255).optional(),
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    ...paginationFields,
  })
  .strict()
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    error: 'minPrice cannot be greater than maxPrice',
  })
  .refine((q) => q.minDays === undefined || q.maxDays === undefined || q.minDays <= q.maxDays, {
    error: 'minDays cannot be greater than maxDays',
  });

// ---------------------------------------------------------------------------
// Itinerary day events
// ---------------------------------------------------------------------------

const DAY_EVENT_TYPES = [
  'ARRIVAL',
  'CHECK_IN',
  'TRANSFER',
  'SIGHTSEEING',
  'ACTIVITY',
  'MEAL',
  'LEISURE',
  'CHECK_OUT',
  'OVERNIGHT',
  'DEPARTURE',
];

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];

// Minutes from midnight. 1439 is 23:59 — a start time of 1440 would be the next day, which on a
// day-numbered itinerary belongs to the next day's row.
const minuteOfDayField = z.coerce
  .number({ error: 'startMinute must be a number' })
  .int('startMinute must be a whole number of minutes')
  .min(0, 'startMinute cannot be negative')
  .max(1439, 'startMinute must be before midnight (max 1439)');

// Capped at 24h: anything longer is not one event, it is the next day.
const durationField = z.coerce
  .number({ error: 'durationMinutes must be a number' })
  .int('durationMinutes must be a whole number of minutes')
  .min(0, 'durationMinutes cannot be negative')
  .max(1440, 'durationMinutes must be at most 24 hours');

const baseEventShape = {
  title: requiredText('title', 200),
  description: z.string().trim().max(5000).nullable().optional(),
  type: z.enum(DAY_EVENT_TYPES, { error: `type must be one of: ${DAY_EVENT_TYPES.join(', ')}` }).optional().default('ACTIVITY'),
  startMinute: minuteOfDayField.nullable().optional(),
  durationMinutes: durationField.nullable().optional(),
  mealsIncluded: z.array(z.enum(MEAL_TYPES)).max(3).optional().default([]),
  availability: z.string().trim().max(200).nullable().optional(),
  transferMode: z.string().trim().max(120).nullable().optional(),
  luggageAllowance: z.string().trim().max(200).nullable().optional(),
};

// One level of nesting only. A sub-event of a sub-event is a level of detail nobody reading an
// itinerary wants, and allowing it would make the renderer recursive for no benefit.
const subEventSchema = z.object(baseEventShape).strict();

const replaceDayEventsSchema = z
  .object({
    events: z
      .array(
        z
          .object({ ...baseEventShape, subEvents: z.array(subEventSchema).max(20).optional().default([]) })
          .strict()
      )
      .max(40, 'At most 40 events per day'),
  })
  .strict();

const dayIdParamSchema = z.object({ dayId: uuidField('dayId') });

/**
 * Editing a day's OWN content — title, brief, description, notes, inclusions, meals — as opposed
 * to its events (replaceDayEventsSchema above). Unlike events this is a plain in-place update:
 * there is exactly one PackageDay row per day number, so there is nothing to archive-and-replace.
 */
const updatePackageDaySchema = z
  .object({
    title: requiredText('title', 200).optional(),
    brief: z.string().trim().max(500).nullable().optional(),
    description: requiredText('description', 20000).optional(),
    // Operational caveats — "carry swimwear", "monument shut on Fridays" — styled as a warning on
    // the itinerary, separate from the long-form description.
    notes: z.string().trim().max(5000).nullable().optional(),
    inclusions: z.string().trim().max(5000).nullable().optional(),
    mealsIncluded: z.array(z.enum(MEAL_TYPES)).max(3).optional(),
    coverImageUrl: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (title, brief, description, notes, inclusions, mealsIncluded, coverImageUrl)',
  });

// travelDate resolves the template onto a calendar; without it the itinerary is still complete,
// it just shows day numbers instead of dates.
const itineraryQuerySchema = z
  .object({ travelDate: z.coerce.date({ error: 'travelDate must be a valid date' }).optional() })
  .strict();

module.exports = {
  replaceDayEventsSchema,
  updatePackageDaySchema,
  dayIdParamSchema,
  itineraryQuerySchema,
  idParamSchema,
  createPackageSchema,
  updatePackageSchema,
  listPackagesSchema,
};
