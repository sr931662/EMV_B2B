const { z } = require('zod');
const { paginationFields } = require('./paginationSchema');

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

// Markdown prose. Generous ceiling because these are read as articles, not as labels. Declared up
// here rather than beside the product schemas because the country schemas below use it too, and a
// const referenced above its declaration is a ReferenceError at module load, not a hoisted name.
const markdownField = (label) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(20000, `${label} must be at most 20000 characters`);

// Remote URLs, not uploads — see the comment on VisaCountry.coverImageUrl in schema.prisma.
const imageUrlField = (label) =>
  z
    .url(`${label} must be a valid URL`)
    .max(2048, `${label} must be at most 2048 characters`)
    .startsWith('https://', `${label} must be an https URL`);

const createVisaCountrySchema = z
  .object({
    name: requiredText('name'),
    shortName: requiredText('shortName', 60).optional(),
    coverImageUrl: imageUrlField('coverImageUrl').optional(),
    flagImageUrl: imageUrlField('flagImageUrl').optional(),
    aboutCountry: markdownField('aboutCountry').optional(),
    arrivalInfo: markdownField('arrivalInfo').optional(),
    baseFee: moneyField('baseFee').optional().default(0),
  })
  .strict();

// Both fields optional (at least one required) so an admin can retarget just the fee without
// resupplying the name, or vice versa.
const updateVisaCountrySchema = z
  .object({
    name: requiredText('name').optional(),
    // Nullable so an admin can clear an image back to no image at all.
    shortName: requiredText('shortName', 60).nullable().optional(),
    coverImageUrl: imageUrlField('coverImageUrl').nullable().optional(),
    flagImageUrl: imageUrlField('flagImageUrl').nullable().optional(),
    aboutCountry: markdownField('aboutCountry').nullable().optional(),
    arrivalInfo: markdownField('arrivalInfo').nullable().optional(),
    baseFee: moneyField('baseFee').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (name, baseFee)',
  });

const listVisaCountriesSchema = z
  .object({ includeArchived: includeArchivedField, ...paginationFields })
  .strict();

// ---------------------------------------------------------------------------
// Visa products
// ---------------------------------------------------------------------------

const VISA_CATEGORIES = ['VISA_FREE', 'VISA_ON_ARRIVAL', 'E_VISA', 'STICKER_VISA'];
const DOCUMENT_CATEGORIES = [
  'PASSPORT',
  'BANK_STATEMENT',
  'INCOME_TAX_RETURN',
  'PRIOR_VISA',
  'PHOTO',
  'OTHER',
];
const DOCUMENT_PROFILES = ['ONLY_PASSPORT', 'PASSPORT_BANK', 'PASSPORT_BANK_ITR', 'WITH_PRIOR_VISA'];

const categoryField = z.enum(VISA_CATEGORIES, {
  error: `category must be one of: ${VISA_CATEGORIES.join(', ')}`,
});

// Working days. 0 is legal and means "instant" (visa on arrival, instant eVisa); 365 is a
// deliberately generous ceiling that still rejects a typo like 3650.
const processingDaysField = (label) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number of working days`)
    .min(0, `${label} cannot be negative`)
    .max(365, `${label} must be at most 365`);

// The checklist a product ships with. Sent inline on create/update rather than through the nested
// document routes, so an admin can define a product and its paperwork in one submit.
const requiredDocumentField = z
  .object({
    // Phase 6: the checklist points at a DocumentType from the library. Optional rather than
    // required because a product may legitimately ask for something the library has not got a name
    // for yet, and blocking the save would send people back to typing free text — the habit this
    // whole migration exists to break.
    documentTypeId: z.uuid('documentTypeId must be a valid UUID').nullable().optional(),
    // Still the authored label, and still required: a product may say "Passport (first and last
    // page)" where the type is simply "Passport", and it is this string that gets printed.
    documentName: requiredText('documentName', 200),
    isMandatory: z.boolean({ error: 'isMandatory must be true or false' }).optional().default(true),
    category: z
      .enum(DOCUMENT_CATEGORIES, { error: `category must be one of: ${DOCUMENT_CATEGORIES.join(', ')}` })
      .optional()
      .default('OTHER'),
  })
  .strict();

// Validity and max stay are calendar days, not working days, and run much longer than a
// processing time — a 10-year multiple-entry visa is normal, so the ceiling is generous.
const calendarDaysField = (label) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number of days`)
    .min(1, `${label} must be at least 1`)
    .max(3650, `${label} must be at most 3650`);

const entryTypeField = z.enum(['SINGLE', 'MULTIPLE'], {
  error: 'entryType must be SINGLE or MULTIPLE',
});

/**
 * One stage of the processing timeline. sortOrder is absent on purpose — the server derives it
 * from array position, so a reorder in the UI is just a reordered array and the client never has
 * to keep index numbers in sync.
 */
const processingStepField = z
  .object({
    title: requiredText('title', 120),
    description: markdownField('description').nullable().optional(),
    estimatedDays: processingDaysField('estimatedDays').nullable().optional(),
  })
  .strict();

const createVisaProductSchema = z
  .object({
    visaCountryId: uuidField('visaCountryId'),
    name: requiredText('name'),
    category: categoryField,
    processingDaysMin: processingDaysField('processingDaysMin').optional(),
    processingDaysMax: processingDaysField('processingDaysMax').optional(),
    validityDays: calendarDaysField('validityDays').optional(),
    maxStayDays: calendarDaysField('maxStayDays').optional(),
    entryType: entryTypeField.optional().default('SINGLE'),
    adultFee: moneyField('adultFee').optional().default(0),
    // Not defaulted from adultFee: a childFee of 0 is a real, common price (children free), so it
    // has to be possible to express it without the server second-guessing the number.
    childFee: moneyField('childFee').optional().default(0),
    faqs: markdownField('faqs').optional(),
    requiredDocuments: z.array(requiredDocumentField).max(30).optional().default([]),
    processingSteps: z.array(processingStepField).max(20).optional().default([]),
  })
  .strict()
  .refine(
    (p) =>
      p.processingDaysMin === undefined ||
      p.processingDaysMax === undefined ||
      p.processingDaysMin <= p.processingDaysMax,
    { error: 'processingDaysMin cannot be greater than processingDaysMax' }
  );

// visaCountryId is absent: a product does not move between countries once created — its checklist
// and any request that snapshotted it are tied to the original country.
const updateVisaProductSchema = z
  .object({
    name: requiredText('name').optional(),
    category: categoryField.optional(),
    processingDaysMin: processingDaysField('processingDaysMin').nullable().optional(),
    processingDaysMax: processingDaysField('processingDaysMax').nullable().optional(),
    validityDays: calendarDaysField('validityDays').nullable().optional(),
    maxStayDays: calendarDaysField('maxStayDays').nullable().optional(),
    entryType: entryTypeField.optional(),
    adultFee: moneyField('adultFee').optional(),
    childFee: moneyField('childFee').optional(),
    faqs: markdownField('faqs').nullable().optional(),
    processingSteps: z.array(processingStepField).max(20).optional(),
    requiredDocuments: z.array(requiredDocumentField).max(30).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update',
  })
  .refine(
    (p) =>
      p.processingDaysMin === undefined ||
      p.processingDaysMax === undefined ||
      p.processingDaysMin === null ||
      p.processingDaysMax === null ||
      p.processingDaysMin <= p.processingDaysMax,
    { error: 'processingDaysMin cannot be greater than processingDaysMax' }
  );

// The marketplace filter set. maxProcessingDays carries the UI's duration buckets (0 instant,
// 1 within a day, 5 within 3-5 working days, 7 a week, 30 a month) as a plain number, so the
// buckets nest without the server knowing anything about them.
const listVisaProductsSchema = z
  .object({
    visaCountryId: uuidField('visaCountryId').optional(),
    category: categoryField.optional(),
    maxProcessingDays: processingDaysField('maxProcessingDays').optional(),
    documentProfile: z
      .enum(DOCUMENT_PROFILES, { error: `documentProfile must be one of: ${DOCUMENT_PROFILES.join(', ')}` })
      .optional(),
    travelDate: z.coerce.date({ error: 'travelDate must be a valid date' }).optional(),
    onlyFeasible: z
      .enum(['true', 'false'], { error: "onlyFeasible must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    search: requiredText('search', 120).optional(),
    // Detail page only — the list would otherwise run a similar-products query per row.
    includeSimilar: z
      .enum(['true', 'false'], { error: "includeSimilar must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    includeArchived: includeArchivedField,
    ...paginationFields,
  })
  .strict()
  .refine((q) => !q.travelDate || q.travelDate.getTime() >= Date.now() - 86_400_000, {
    error: 'travelDate cannot be in the past',
  });

// ---------------------------------------------------------------------------
// Required-document checklist, nested under a PRODUCT
// ---------------------------------------------------------------------------
//
// Nested under the product rather than the country: an eVisa and a sticker visa for the same
// country need different paperwork, so one checklist per country could not represent both.

const productIdParamSchema = z.object({ productId: uuidField('productId') });
const productDocParamSchema = z.object({
  productId: uuidField('productId'),
  docId: uuidField('docId'),
});

// z.boolean(), not z.coerce.boolean(): these bodies are JSON, and Boolean("false") === true in
// JS — coercing a stringly "false" would silently invert it. Coercion is reserved for genuinely
// string-typed input (query params, multipart fields), never JSON booleans.
const createVisaDocumentSchema = requiredDocumentField;

const updateVisaDocumentSchema = z
  .object({
    documentName: requiredText('documentName', 200).optional(),
    isMandatory: z.boolean({ error: 'isMandatory must be true or false' }).optional(),
    category: z
      .enum(DOCUMENT_CATEGORIES, { error: `category must be one of: ${DOCUMENT_CATEGORIES.join(', ')}` })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (documentName, isMandatory, category)',
  });

const listVisaDocumentsSchema = z
  .object({ includeArchived: includeArchivedField, ...paginationFields })
  .strict();

// ---------------------------------------------------------------------------
// Visa requests + passengers
// ---------------------------------------------------------------------------

// Deliberately lenient on passportNumber format: international passport formats vary too widely
// (length, alphanumeric mix) to safely regex-validate without false-rejecting real passports.
const passengerSchema = z
  .object({
    fullName: requiredText('fullName'),
    gender: requiredText('gender', 30), // free text per DATA_MODELS.md, not an enum
    // Which of the product's two fees this passenger is charged at. Explicit rather than derived
    // from dob, because the adult/child cutoff age differs by country and consulate — and a
    // derived value would silently reprice a request when a passenger had a birthday.
    passengerType: z
      .enum(['ADULT', 'CHILD'], { error: 'passengerType must be ADULT or CHILD' })
      .optional()
      .default('ADULT'),
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
      // The product, not the country: the country cannot say which of its visa options this is,
      // and the fee we freeze comes from the product.
      visaProductId: uuidField('visaProductId'),
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
    ...paginationFields,
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
  createVisaProductSchema,
  updateVisaProductSchema,
  listVisaProductsSchema,
  productIdParamSchema,
  productDocParamSchema,
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
