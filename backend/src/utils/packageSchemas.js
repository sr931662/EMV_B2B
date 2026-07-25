const { z } = require('zod');
const { withBrandGuard } = require('./brandGuard');

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

const priceField = z.coerce
  .number({ error: 'rawPrice is required and must be a number' })
  .min(0, 'rawPrice cannot be negative')
  .max(MAX_PRICE, `rawPrice must be at most ${MAX_PRICE}`)
  .refine((v) => Math.round(v * 100) / 100 === v, 'rawPrice may have at most 2 decimal places');

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
    rawPrice: priceField,
    inclusions: requiredText('inclusions', 20000),
    exclusions: requiredText('exclusions', 20000),
    gallery: stringArray('gallery').optional().default([]),
    tags: stringArray('tags', 60, 20).optional().default([]),
    dayTemplateIds: dayTemplateIdsField,
    hotelIds: hotelIdsField.optional().default([]),
  })
  .strict();

// destinationId is absent: a package does not move between destinations, and moving it would
// orphan its copied days/hotels from the destination they were validated against.
const updatePackageSchema = z
  .object({
    title: packageTitleField.optional(),
    days: z.coerce.number().int('days must be a whole number').min(1).max(60).optional(),
    nights: z.coerce.number().int('nights must be a whole number').min(0).max(60).optional(),
    rawPrice: priceField.optional(),
    inclusions: requiredText('inclusions', 20000).optional(),
    exclusions: requiredText('exclusions', 20000).optional(),
    gallery: stringArray('gallery').optional(),
    tags: stringArray('tags', 60, 20).optional(),
    dayTemplateIds: dayTemplateIdsField.optional(),
    hotelIds: hotelIdsField.optional(),
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
  })
  .strict()
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    error: 'minPrice cannot be greater than maxPrice',
  })
  .refine((q) => q.minDays === undefined || q.maxDays === undefined || q.minDays <= q.maxDays, {
    error: 'minDays cannot be greater than maxDays',
  });

module.exports = {
  idParamSchema,
  createPackageSchema,
  updatePackageSchema,
  listPackagesSchema,
};
