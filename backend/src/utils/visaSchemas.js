const { z } = require('zod');

const MAX_PRICE = 9999999999.99; // Decimal(12,2)

const uuidField = (label) => z.uuid(`${label} must be a valid UUID`);

const requiredText = (label, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

// Mirrors quoteSchemas.js's moneyField exactly — same Decimal(12,2) constraints, same reasoning.
const moneyField = (label) =>
  z.coerce
    .number({ error: `${label} is required and must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(MAX_PRICE, `${label} must be at most ${MAX_PRICE}`)
    .refine((v) => Math.round(v * 100) / 100 === v, `${label} may have at most 2 decimal places`);

// Fields the server computes/owns for visa requests — a client may send them (e.g. round-tripping
// a fetched request back to us) but we silently drop rather than 400, mirroring quoteSchemas.js's
// SERVER_OWNED/stripServerOwned pattern. sellingPrice is always recomputed server-side from the
// request's own frozen baseFeeAtRequest × passenger count + markupAmount — a client-supplied
// value is never read.
const SERVER_OWNED_VISA_REQUEST = ['baseFeeAtRequest', 'sellingPrice'];

const stripServerOwnedVisaRequest = (schema) =>
  z.preprocess((val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const copy = { ...val };
      SERVER_OWNED_VISA_REQUEST.forEach((k) => delete copy[k]);
      return copy;
    }
    return val;
  }, schema);

// Absent from any schema below: includeArchived transform mirrors the pattern already used by
// librarySchemas.js / packageSchemas.js.
const includeArchivedField = z
  .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
  .optional()
  .transform((v) => v === 'true');

// ---------------------------------------------------------------------------
// Visa countries
// ---------------------------------------------------------------------------

const idParamSchema = z.object({ id: uuidField('id') });

const createVisaCountrySchema = z
  .object({
    name: requiredText('name'),
    baseFee: moneyField('baseFee').optional().default(0),
  })
  .strict();

// Both fields optional (at least one required) so an admin can retarget just the fee without
// resupplying the name, or vice versa.
const updateVisaCountrySchema = z
  .object({
    name: requiredText('name').optional(),
    baseFee: moneyField('baseFee').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (name, baseFee)',
  });

const listVisaCountriesSchema = z.object({ includeArchived: includeArchivedField }).strict();

// ---------------------------------------------------------------------------
// Required-document checklist, nested under a country
// ---------------------------------------------------------------------------

const countryIdParamSchema = z.object({ countryId: uuidField('countryId') });
const countryDocParamSchema = z.object({
  countryId: uuidField('countryId'),
  docId: uuidField('docId'),
});

// z.boolean(), not z.coerce.boolean(): these bodies are JSON, and Boolean("false") === true in
// JS — coercing a stringly "false" would silently invert it. Coercion is reserved for genuinely
// string-typed input (query params, multipart fields), never JSON booleans.
const createVisaDocumentSchema = z
  .object({
    documentName: requiredText('documentName', 200),
    isMandatory: z.boolean({ error: 'isMandatory must be true or false' }).optional().default(true),
  })
  .strict();

const updateVisaDocumentSchema = z
  .object({
    documentName: requiredText('documentName', 200).optional(),
    isMandatory: z.boolean({ error: 'isMandatory must be true or false' }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (documentName, isMandatory)',
  });

const listVisaDocumentsSchema = z.object({ includeArchived: includeArchivedField }).strict();

// ---------------------------------------------------------------------------
// Visa requests + passengers
// ---------------------------------------------------------------------------

// Deliberately lenient on passportNumber format: international passport formats vary too widely
// (length, alphanumeric mix) to safely regex-validate without false-rejecting real passports.
const passengerSchema = z
  .object({
    fullName: requiredText('fullName'),
    gender: requiredText('gender', 30), // free text per DATA_MODELS.md, not an enum
    dob: z.coerce.date({ error: 'dob is required and must be a valid date' }),
    nationality: requiredText('nationality', 100),
    passportNumber: requiredText('passportNumber', 30),
    passportExpiry: z.coerce.date({ error: 'passportExpiry is required and must be a valid date' }),
    travelDate: z.coerce.date({ error: 'travelDate is required and must be a valid date' }),
    returnDate: z.coerce.date({ error: 'returnDate is required and must be a valid date' }),
  })
  .strict()
  .refine((p) => p.returnDate >= p.travelDate, {
    error: 'returnDate cannot be before travelDate',
    path: ['returnDate'],
  })
  .refine((p) => p.passportExpiry > p.travelDate, {
    error: 'passportExpiry must be after travelDate — the passport must still be valid for travel',
    path: ['passportExpiry'],
  });

const passengersField = z
  .array(passengerSchema, { error: 'passengers must be an array' })
  .min(1, 'At least one passenger is required')
  .max(20, 'At most 20 passengers per request');

const createVisaRequestSchema = stripServerOwnedVisaRequest(
  z
    .object({
      visaCountryId: uuidField('visaCountryId'),
      visaType: z.enum(['REGULAR', 'E_VISA'], {
        error: 'visaType must be REGULAR or E_VISA',
      }),
      passengers: passengersField,
      markupAmount: moneyField('markupAmount').optional().default(0),
    })
    .strict()
);

// visaCountryId is absent: a request does not move between countries once created — its
// document checklist and any uploaded proof are validated against the original country.
//
// passengers is OPTIONAL here (unlike create): a partner adjusting only markupAmount must not be
// forced to resubmit the passenger list, because doing so would go through the replace-pattern in
// visaRequestService.update and archive/reinsert every passenger — which in turn archives their
// document uploads and resets documentReadiness to false, even though nothing about the
// passengers actually changed. At least one of the two fields must be present.
const updateVisaRequestSchema = stripServerOwnedVisaRequest(
  z
    .object({
      passengers: passengersField.optional(),
      markupAmount: moneyField('markupAmount').optional(),
      visaType: z
        .enum(['REGULAR', 'E_VISA'], {
          error: 'visaType must be REGULAR or E_VISA',
        })
        .optional(),
    })
    .strict()
    .refine(
      (data) =>
        data.passengers !== undefined || data.markupAmount !== undefined || data.visaType !== undefined,
      {
        error: 'Provide passengers, markupAmount and/or visaType to update',
      }
    )
);

const listVisaRequestsSchema = z
  .object({
    partnerId: uuidField('partnerId').optional(), // admin-only filter; ignored for partners
    status: z
      .enum(
        [
          'APPLICATION_SUBMITTED',
          'PAYMENT_SUBMITTED',
          'PENDING_VERIFICATION',
          'PAYMENT_APPROVED',
          'VISA_PROCESSING_STARTED',
          'COMPLETED',
          'REJECTED',
        ],
        { error: 'status is not a valid visa request status' }
      )
      .optional(),
    includeArchived: includeArchivedField,
  })
  .strict();

// ---------------------------------------------------------------------------
// Passenger document upload
// ---------------------------------------------------------------------------

const requestPassengerParamSchema = z.object({
  id: uuidField('id'), // visa request id
  passengerId: uuidField('passengerId'),
});

const requestPassengerUploadParamSchema = z.object({
  id: uuidField('id'),
  passengerId: uuidField('passengerId'),
  uploadId: uuidField('uploadId'),
});

// documentName here is matched against the country's live required-document list in the
// service layer (400 if unrecognised) — zod only checks shape, not the cross-table match.
const uploadVisaDocumentSchema = z.object({ documentName: requiredText('documentName', 200) }).strict();

module.exports = {
  idParamSchema,
  createVisaCountrySchema,
  updateVisaCountrySchema,
  listVisaCountriesSchema,
  countryIdParamSchema,
  countryDocParamSchema,
  createVisaDocumentSchema,
  updateVisaDocumentSchema,
  listVisaDocumentsSchema,
  passengerSchema,
  createVisaRequestSchema,
  updateVisaRequestSchema,
  listVisaRequestsSchema,
  requestPassengerParamSchema,
  requestPassengerUploadParamSchema,
  uploadVisaDocumentSchema,
};
