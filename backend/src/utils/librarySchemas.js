const { z } = require('zod');
const { withBrandGuard } = require('./brandGuard');
const { paginationFields } = require('./paginationSchema');

// Schemas for the three data-library resources (destinations, day templates, hotels).
//
// Bodies are .strict(): an unrecognised key is a 400 rather than a silent no-op. That
// matters most on PATCH, where {destinationId} would otherwise look like it moved a hotel
// to another destination while actually doing nothing.

const uuidField = (label) => z.uuid(`${label} must be a valid UUID`);

const requiredText = (label, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (label, max = 255) =>
  z.string({ error: `${label} must be a string` }).trim().min(1, `${label} cannot be empty`).max(max);

// Shared: every /:id route.
const idParamSchema = z.object({ id: uuidField('id') });

// Shared: archived visibility on every list endpoint. Absent -> false, i.e. default
// queries exclude archived rows (locked rule 1).
const includeArchivedField = z
  .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
  .optional()
  .transform((v) => v === 'true');

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

// Destination names are reproduced verbatim in partner white-label PDFs, so they may not carry
// EMV branding (locked rule 4b) — same reasoning as the package title.
const destinationNameField = withBrandGuard(requiredText('name'), 'Destination name');
const destinationMarkdownField = z
  .string({ error: 'markdown content must be a string' })
  .trim()
  .max(50000, 'markdown content must be at most 50000 characters');

// Phase 3: a destination now sits inside a country. Either identifier is accepted — an id from a
// picker, or a name from a form or import, which the service creates on first mention. Both stay
// optional because the service falls back to a country of the destination's own name, which is
// precisely what the flat table meant before the hierarchy existed.
const countryFields = {
  countryId: uuidField('countryId').optional(),
  countryName: optionalText('countryName').optional(),
  state: optionalText('state').optional(),
  city: optionalText('city').optional(),
  shortName: optionalText('shortName', 60).optional(),
};

const createDestinationSchema = z
  .object({
    name: destinationNameField,
    aboutDestination: destinationMarkdownField.optional(),
    packages: destinationMarkdownField.optional(),
    faqs: destinationMarkdownField.optional(),
    ...countryFields,
  })
  .strict();

const updateDestinationSchema = z
  .object({
    name: destinationNameField.optional(),
    aboutDestination: destinationMarkdownField.optional(),
    packages: destinationMarkdownField.optional(),
    faqs: destinationMarkdownField.optional(),
    ...countryFields,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error:
      'Provide at least one field to update (name, aboutDestination, packages, faqs, countryId, ' +
      'countryName, state, city, shortName)',
  });

const listDestinationsSchema = z
  .object({
    includeArchived: includeArchivedField,
    // Narrows the list to one country — the question the flat table could not answer.
    countryId: uuidField('countryId').optional(),
    ...paginationFields,
  })
  .strict();

// ---------------------------------------------------------------------------
// Day templates
// ---------------------------------------------------------------------------

const createDayTemplateSchema = z
  .object({
    destinationId: uuidField('destinationId'),
    title: requiredText('title'),
    description: requiredText('description', 20000),
  })
  .strict();

// destinationId is deliberately absent: a template does not move between destinations.
const updateDayTemplateSchema = z
  .object({
    title: optionalText('title').optional(),
    description: optionalText('description', 20000).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (title, description)',
  });

const listDayTemplatesSchema = z
  .object({
    destinationId: uuidField('destinationId').optional(),
    includeArchived: includeArchivedField,
    ...paginationFields,
  })
  .strict();

// ---------------------------------------------------------------------------
// Day template events — the day-by-day itinerary content a template actually exists to hold.
// Mirrors packageSchemas.js's replaceDayEventsSchema field-for-field (the two shapes must agree —
// packageService.copyEvent() copies one into the other at package-build time), with one addition:
// `activityId`, a REAL library reference here (DayTemplateEvent keeps a live FK), unlike
// PackageDayEvent's frozen sourceActivityId breadcrumb which isn't caller-settable at all.
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
const eventDurationField = z.coerce
  .number({ error: 'durationMinutes must be a number' })
  .int('durationMinutes must be a whole number of minutes')
  .min(0, 'durationMinutes cannot be negative')
  .max(1440, 'durationMinutes must be at most 24 hours');

const templateEventShape = {
  title: requiredText('title', 200),
  description: z.string().trim().max(5000).nullable().optional(),
  type: z
    .enum(DAY_EVENT_TYPES, { error: `type must be one of: ${DAY_EVENT_TYPES.join(', ')}` })
    .optional()
    .default('ACTIVITY'),
  activityId: uuidField('activityId').nullable().optional(),
  startMinute: minuteOfDayField.nullable().optional(),
  durationMinutes: eventDurationField.nullable().optional(),
  mealsIncluded: z.array(z.enum(MEAL_TYPES)).max(3).optional().default([]),
  availability: z.string().trim().max(200).nullable().optional(),
  transferMode: z.string().trim().max(120).nullable().optional(),
  luggageAllowance: z.string().trim().max(200).nullable().optional(),
};

// One level of nesting only — same reasoning as packages: a sub-event of a sub-event is a level
// of detail nobody reading an itinerary wants.
const templateSubEventSchema = z.object(templateEventShape).strict();

const replaceDayTemplateEventsSchema = z
  .object({
    events: z
      .array(
        z
          .object({ ...templateEventShape, subEvents: z.array(templateSubEventSchema).max(20).optional().default([]) })
          .strict()
      )
      .max(40, 'At most 40 events per day'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

// Array of URLs/paths. Real file upload lands later; for now the strings are stored as given.
const imagesField = z
  .array(z.string().trim().min(1, 'image entries cannot be empty').max(1000), {
    error: 'images must be an array of strings',
  })
  .max(50, 'At most 50 images');

// Defaults offered when this hotel is put into a package — the package keeps its own copy, so
// these two are conveniences at build time, not commitments (see Hotel.roomType/mealPlan in
// schema.prisma).
const starRatingField = z.coerce
  .number({ error: 'starRating must be a number' })
  .int('starRating must be a whole number')
  .min(1)
  .max(7);

const createHotelSchema = z
  .object({
    destinationId: uuidField('destinationId'),
    name: requiredText('name'),
    category: requiredText('category', 100),
    description: requiredText('description', 20000),
    images: imagesField.optional().default([]),
    starRating: starRatingField.nullable().optional(),
    roomType: optionalText('roomType', 100).nullable().optional(),
    mealPlan: optionalText('mealPlan', 100).nullable().optional(),
    address: optionalText('address', 2000).nullable().optional(),
    phone: optionalText('phone', 40).nullable().optional(),
  })
  .strict();

const updateHotelSchema = z
  .object({
    name: optionalText('name').optional(),
    category: optionalText('category', 100).optional(),
    description: optionalText('description', 20000).optional(),
    images: imagesField.optional(),
    starRating: starRatingField.nullable().optional(),
    roomType: optionalText('roomType', 100).nullable().optional(),
    mealPlan: optionalText('mealPlan', 100).nullable().optional(),
    address: optionalText('address', 2000).nullable().optional(),
    phone: optionalText('phone', 40).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error:
      'Provide at least one field to update (name, category, description, images, starRating, roomType, mealPlan, address, phone)',
  });

const listHotelsSchema = z
  .object({
    destinationId: uuidField('destinationId').optional(),
    includeArchived: includeArchivedField,
    ...paginationFields,
  })
  .strict();

module.exports = {
  idParamSchema,
  createDestinationSchema,
  updateDestinationSchema,
  listDestinationsSchema,
  createDayTemplateSchema,
  updateDayTemplateSchema,
  listDayTemplatesSchema,
  replaceDayTemplateEventsSchema,
  createHotelSchema,
  updateHotelSchema,
  listHotelsSchema,
};
