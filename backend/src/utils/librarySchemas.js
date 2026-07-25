const { z } = require('zod');
const { withBrandGuard } = require('./brandGuard');

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

const createDestinationSchema = z.object({ name: destinationNameField }).strict();

const updateDestinationSchema = z.object({ name: destinationNameField }).strict();

const listDestinationsSchema = z.object({ includeArchived: includeArchivedField }).strict();

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

const createHotelSchema = z
  .object({
    destinationId: uuidField('destinationId'),
    name: requiredText('name'),
    category: requiredText('category', 100),
    description: requiredText('description', 20000),
    images: imagesField.optional().default([]),
  })
  .strict();

const updateHotelSchema = z
  .object({
    name: optionalText('name').optional(),
    category: optionalText('category', 100).optional(),
    description: optionalText('description', 20000).optional(),
    images: imagesField.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (name, category, description, images)',
  });

const listHotelsSchema = z
  .object({
    destinationId: uuidField('destinationId').optional(),
    includeArchived: includeArchivedField,
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
  createHotelSchema,
  updateHotelSchema,
  listHotelsSchema,
};
