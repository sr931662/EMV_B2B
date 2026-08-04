const { z } = require('zod');

const MAX_PRICE = 9999999999.99; // Decimal(12,2)

const uuidField = (label) => z.uuid(`${label} must be a valid UUID`);

const requiredText = (label, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const moneyField = (label) =>
  z.coerce
    .number({ error: `${label} is required and must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(MAX_PRICE, `${label} must be at most ${MAX_PRICE}`)
    .refine((v) => Math.round(v * 100) / 100 === v, `${label} may have at most 2 decimal places`);

/**
 * Fields the server owns. A client may send them — we drop them rather than 400, so a caller
 * that round-trips a quote object back to us does not get a confusing error. sellingPrice in
 * particular is always recomputed from the package's rawPrice + markupAmount (locked rule 5);
 * a client-supplied value is never read.
 */
const SERVER_OWNED = [
  'id',
  'partnerId',
  'rawPriceAtQuote', // frozen from the package at creation; a client may never set or move it
  'sellingPrice',
  'status',
  'pdfPath',
  'archived',
  'createdAt',
  'updatedAt',
];

const stripServerOwned = (schema) =>
  z.preprocess((val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const copy = { ...val };
      SERVER_OWNED.forEach((k) => delete copy[k]);
      return copy;
    }
    return val;
  }, schema);

const leadFields = {
  leadName: requiredText('leadName'),
  contactNumber: z
    .string({ error: 'contactNumber is required' })
    .trim()
    .regex(/^\+?[0-9][0-9 -]{6,19}$/, 'contactNumber must be 7-20 digits, optionally prefixed with +'),
  email: z
    .string({ error: 'email is required' })
    .trim()
    .toLowerCase()
    .pipe(z.email('email must be a valid email address')),
  travelDate: z.coerce.date({ error: 'travelDate is required and must be a valid date' }),
  adults: z.coerce
    .number({ error: 'adults is required' })
    .int('adults must be a whole number')
    .min(1, 'adults must be at least 1')
    .max(99),
  children: z.coerce.number().int('children must be a whole number').min(0).max(99).optional().default(0),
  infants: z.coerce.number().int('infants must be a whole number').min(0).max(99).optional().default(0),
  specialRequests: z.string().trim().max(5000).optional(),
};

const idParamSchema = z.object({ id: uuidField('id') });

const createQuoteSchema = stripServerOwned(
  z
    .object({
      packageId: uuidField('packageId'),
      ...leadFields,
      markupAmount: moneyField('markupAmount'),
      branding: z.enum(['EMV', 'OWN'], { error: "branding must be 'EMV' or 'OWN'" }),
    })
    .strict()
);

// packageId is absent: a quote does not move to a different package — its PDF, selling price
// and lead expectations are all built around the one it was created for.
const updateQuoteSchema = stripServerOwned(
  z
    .object({
      leadName: requiredText('leadName').optional(),
      contactNumber: leadFields.contactNumber.optional(),
      email: leadFields.email.optional(),
      travelDate: leadFields.travelDate.optional(),
      adults: leadFields.adults.optional(),
      children: z.coerce.number().int().min(0).max(99).optional(),
      infants: z.coerce.number().int().min(0).max(99).optional(),
      specialRequests: z.string().trim().max(5000).optional(),
      markupAmount: moneyField('markupAmount').optional(),
      branding: z.enum(['EMV', 'OWN'], { error: "branding must be 'EMV' or 'OWN'" }).optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      error: 'Provide at least one field to update',
    })
);

const listQuotesSchema = z
  .object({
    // Admin-only filter; ignored for partners, who always see just their own.
    partnerId: uuidField('partnerId').optional(),
    status: z
      .enum(
        [
          'QUOTE_GENERATED',
          'CUSTOMER_APPROVED',
          'PAYMENT_SUBMITTED',
          'PENDING_VERIFICATION',
          'BOOKING_CONFIRMED',
          'ORDER_COMPLETED',
          'REJECTED',
        ],
        { error: 'status is not a valid quote status' }
      )
      .optional(),
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

/**
 * Replaces the whole traveller list for a quote.
 *
 * An empty array is legal: it clears the list. Travellers are collected after pricing, so a
 * partner must be able to save a partial list and come back — see quoteTravellerService.
 */
const replaceTravellersSchema = z
  .object({
    travellers: z
      .array(
        z
          .object({
            fullName: z
              .string({ error: 'fullName is required' })
              .trim()
              .min(1, 'fullName is required')
              .max(255, 'fullName must be at most 255 characters'),
            dob: z.coerce.date({ error: 'dob is required and must be a valid date' }),
            type: z
              .enum(['ADULT', 'CHILD', 'INFANT'], { error: 'type must be ADULT, CHILD or INFANT' })
              .optional()
              .default('ADULT'),
          })
          .strict()
      )
      .max(30, 'At most 30 travellers per trip'),
  })
  .strict();

module.exports = {
  replaceTravellersSchema, idParamSchema, createQuoteSchema, updateQuoteSchema, listQuotesSchema };
