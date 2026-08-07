const { buildSearchText } = require('../utils/searchText');

/**
 * One declaration per library entity. The generic service, controller and routes read from here, so
 * adding a library module is an entry in this file rather than another CRUD stack.
 *
 * WHAT EACH ENTRY DECLARES
 *   model            the Prisma model name
 *   entityType       the string used in AuditLog and EntityLink — must be stable forever
 *   searchFields     which columns feed searchText, and therefore what a picker matches on
 *   toOption         projection to the uniform picker shape
 *   commercialFields fields a data feeder may NOT write (see field-level permissions below)
 *   defaultOrder     how a list reads before anyone sorts it
 *   scopeField       optional parent used to filter a picker (hotels within a destination)
 *
 * The registry deliberately does NOT try to describe validation. Zod schemas stay per entity,
 * because that is where the rules that are genuinely different live, and flattening them into a
 * config would make the simple cases unreadable to save nothing.
 */

/**
 * Every picker returns this shape regardless of entity, so one frontend component works for hotels,
 * destinations, trip types and anything added later.
 */
function option(id, label, sublabel, imageUrl, meta) {
  return { id, label, sublabel: sublabel ?? null, imageUrl: imageUrl ?? null, meta: meta ?? {} };
}


/**
 * A writable field.
 *
 * Two jobs, deliberately one declaration:
 *   - the admin shell renders its editor from this, so a new field appears in the UI the moment it
 *     is declared here rather than after someone remembers to add an input;
 *   - libraryService whitelists writes against it, so the generic `POST /api/library/:entity` cannot
 *     be used to set a column nobody intended to expose. A generic write endpoint without a
 *     whitelist is an open door onto every column in the table.
 *
 * `type` is a rendering hint, not validation. Validation stays with zod where an entity has its own
 * routes, and with Prisma otherwise.
 */
function field(name, label, type = 'text', extra = {}) {
  return { name, label, type, ...extra };
}

const REGISTRY = {
  lookup: {
    model: 'lookupItem',
    entityType: 'LookupItem',
    label: 'Vocabulary item',
    searchFields: ['name', 'description'],
    buildSearch: (row) => buildSearchText(row.name, row.description),
    defaultOrder: [{ sortOrder: 'asc' }, { name: 'asc' }],
    // A lookup list is always read one type at a time; a mixed list of trip types and meal plans
    // would be meaningless.
    requiredFilter: 'type',
    toOption: (row) => option(row.id, row.name, row.description, row.imageUrl, {
      type: row.type,
      slug: row.slug,
      icon: row.icon,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      // Slug is what saved references point at, so it is set once and then left alone.
      field('slug', 'Slug', 'text', { createOnly: true, hint: 'Generated from the name if left blank' }),
      field('description', 'Description', 'textarea'),
      field('icon', 'Icon', 'text', { hint: 'Icon name, not a URL' }),
      field('imageUrl', 'Image', 'image'),
      field('sortOrder', 'Sort order', 'number', { default: 0, hint: 'Lower shows first in pickers' }),
    ],
    commercialFields: [],
  },

  currency: {
    model: 'currency',
    entityType: 'Currency',
    label: 'Currency',
    idField: 'code',
    // Bulk import matches an existing row by this column when the sheet has no id (or a stale
    // one) — 'code' rather than the default 'name' because that is Currency's real identity.
    naturalKey: 'code',
    searchFields: ['code', 'name'],
    buildSearch: null, // small, fixed list — a trigram index would cost more than it saves
    defaultOrder: [{ sortOrder: 'asc' }, { code: 'asc' }],
    toOption: (row) => option(row.code, `${row.code} — ${row.name}`, row.symbol, null, {
      decimalDigits: row.decimalDigits,
      isBaseCurrency: row.isBaseCurrency,
    }),
    fields: [
      field('code', 'ISO code', 'text', { required: true, createOnly: true, hint: 'ISO 4217 — INR, USD, AED' }),
      field('name', 'Name', 'text', { required: true }),
      // A handful of ISO 4217 currencies (mostly settlement units like XSU, or minor currencies
      // with no distinct glyph) have no conventional symbol. `fallbackTo` only affects bulk import
      // — see bulkDataService.importEntity — so the manual form still requires typing one in.
      field('symbol', 'Symbol', 'text', { required: true, fallbackTo: 'code' }),
      // JPY has none, KWD has three. Hardcoding two silently mis-rounds both.
      field('decimalDigits', 'Decimal places', 'number', { default: 2, hint: '0 for JPY, 3 for KWD' }),
      field('isBaseCurrency', 'Reporting currency', 'boolean', {
        hint: 'The currency the business reports in. Exactly one.',
      }),
      field('sortOrder', 'Sort order', 'number', { default: 0 }),
    ],
    // Only an admin sets which currency the business reports in.
    commercialFields: ['isBaseCurrency'],
  },

  country: {
    model: 'country',
    entityType: 'Country',
    label: 'Country',
    searchFields: ['name', 'shortName', 'isoAlpha2', 'isoAlpha3'],
    buildSearch: (row) =>
      buildSearchText(row.name, row.shortName, row.isoAlpha2, row.isoAlpha3),
    defaultOrder: [{ name: 'asc' }],
    toOption: (row) => option(row.id, row.name, row.isoAlpha2 ?? row.shortName, row.flagImageUrl, {
      isoAlpha2: row.isoAlpha2,
      isoAlpha3: row.isoAlpha3,
      currencyCode: row.currencyCode,
      dialCode: row.dialCode,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('slug', 'Slug', 'text', { createOnly: true, hint: 'Generated from the name if left blank' }),
      field('shortName', 'Short name', 'text', { hint: '"UAE" — cards are narrow and full names wrap' }),
      field('isoAlpha2', 'ISO alpha-2', 'text', { hint: 'AE. What flag and phone libraries key on.' }),
      field('isoAlpha3', 'ISO alpha-3', 'text', { hint: 'ARE. What airline and visa systems use.' }),
      field('dialCode', 'Dial code', 'text', { hint: '+971' }),
      field('currencyCode', 'Default currency', 'picker', { entity: 'currency' }),
      field('flagImageUrl', 'Flag', 'image'),
      field('heroImageUrl', 'Hero image', 'image'),
      field('description', 'About', 'textarea', { hint: 'Markdown.' }),
      field('languages', 'Languages', 'tags'),
      field('timeZones', 'Time zones', 'tags', { hint: 'IANA names, e.g. Asia/Dubai' }),
      field('bestMonths', 'Best months', 'tags', {
        numeric: true,
        hint: 'Month numbers 1-12. Stored as numbers so "where should I go in March" is a query.',
      }),
      field('weatherSummary', 'Weather', 'textarea'),
      field('emergencyContacts', 'Emergency contacts', 'textarea'),
      field('embassyDetails', 'Embassy details', 'textarea'),
      field('travelNotes', 'Travel notes', 'textarea', { hint: 'Shown on arrival information.' }),
      // Country.baseFee (wholesale per-passenger visa fee, absorbed from VisaCountry at the
      // contract step) is deliberately NOT declared here. roles.js is explicit that data_feeder
      // must be kept away from visa wholesale pricing entirely — "not raw wholesale pricing", not
      // merely unable to edit it — and this registry's generic routes run under CAN_READ_LIBRARY/
      // CAN_WRITE_LIBRARY, which include data_feeder. A field left off `fields` is dropped by
      // stripUnknownFields before it reaches the database (see libraryService.create/update), so
      // baseFee stays writable ONLY through visaCountryService (/api/visa-countries), which runs
      // under the narrower CAN_WRITE_VISA_CONFIG = ['admin'].
    ],
    // Its default currency is a reporting choice that propagates into every quote raised there.
    commercialFields: ['currencyCode'],
  },

  destination: {
    model: 'destination',
    entityType: 'Destination',
    label: 'Destination',
    // Has a richer screen of its own inside the Library, so the generic browser does not list it —
    // otherwise the same entity appears twice with two different editors, which is precisely the
    // duplication this registry exists to prevent.
    dedicatedScreen: true,
    searchFields: ['name', 'shortName', 'city', 'state'],
    buildSearch: (row) => buildSearchText(row.name, row.shortName, row.city, row.state),
    defaultOrder: [{ name: 'asc' }],
    // A destination now sits inside a country, so a picker can be narrowed to one — "hotels in
    // Thailand" is a question the old flat list could not answer.
    scopeField: 'countryId',
    toOption: (row) => option(row.id, row.name, row.shortName ?? row.city, row.coverImageUrl, {
      countryId: row.countryId,
      city: row.city,
      state: row.state,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('countryId', 'Country', 'picker', { entity: 'country', required: true }),
      field('city', 'City', 'text'),
      field('state', 'State / region', 'text'),
      field('shortName', 'Short name', 'text'),
      field('shortCode', 'Code', 'text', { hint: 'Internal shorthand used in itinerary exports.' }),
      field('timeZone', 'Time zone', 'text', { hint: 'IANA name, e.g. Asia/Bangkok' }),
      field('coverImageUrl', 'Cover image', 'image'),
      field('aboutDestination', 'About', 'textarea', { hint: 'Markdown.' }),
      field('bestSeason', 'Best season', 'text'),
      field('weatherSummary', 'Weather', 'textarea'),
      field('generalNotes', 'General notes', 'textarea', { hint: 'Reproduced on every voucher sold here.' }),
      field('toursAndTransfersNotes', 'Tours & transfers notes', 'textarea'),
      field('faqs', 'FAQs', 'textarea', { hint: 'Markdown.' }),
      field('seoTitle', 'SEO title', 'text'),
      field('seoDescription', 'SEO description', 'textarea'),
      field('seoKeywords', 'SEO keywords', 'tags'),
    ],
    commercialFields: [],
  },

  hotel: {
    model: 'hotel',
    entityType: 'Hotel',
    label: 'Hotel',
    // Has a richer screen of its own inside the Library, so the generic browser does not list it —
    // otherwise the same entity appears twice with two different editors, which is precisely the
    // duplication this registry exists to prevent.
    dedicatedScreen: true,
    searchFields: ['name', 'category', 'address', 'roomType'],
    buildSearch: (row) => buildSearchText(row.name, row.category, row.address, row.roomType),
    defaultOrder: [{ name: 'asc' }],
    scopeField: 'destinationId',
    toOption: (row) => option(row.id, row.name, row.category, row.coverImageUrl, {
      starRating: row.starRating,
      destinationId: row.destinationId,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('destinationId', 'Destination', 'picker', { entity: 'destination', required: true }),
      field('category', 'Category', 'text', { required: true, hint: 'Deluxe, Standard, Villa…' }),
      field('starRating', 'Star rating', 'number'),
      field('description', 'Description', 'textarea', { required: true }),
      field('address', 'Address', 'textarea'),
      field('phone', 'Phone', 'text'),
      field('mapLink', 'Map link', 'text'),
      field('coverImageUrl', 'Cover image', 'image'),
      field('roomType', 'Room type', 'text'),
      field('mealPlan', 'Meal plan', 'text'),
      field('refundable', 'Refundable', 'boolean'),
      field('servicesOffered', 'Services offered', 'textarea'),
    ],
    // Phase 5: prices live on HotelRate, which has its own editor because a rate card is only
    // correct in relation to itself — a gap or a duplicate is invisible while editing one row.
    childEditor: 'hotel-rates',
    // The hotel row itself still carries no price, so there is nothing here to withhold. What a
    // supplier charges is guarded on the rate routes instead, which are admin-only.
    commercialFields: [],
  },

  // Neither 'visaCountry' nor 'visaProduct' is registered here. Both were tried in an earlier pass
  // of this work and reverted: the whole visa-config surface (countries as visa entities, products,
  // required documents) runs under CAN_READ_VISA_CONFIG / CAN_WRITE_VISA_CONFIG in roles.js —
  // ['admin','partner'] read, ['admin'] write — a DELIBERATELY narrower boundary than this
  // registry's CAN_READ_LIBRARY / CAN_WRITE_LIBRARY (which include data_feeder), put there the
  // moment visa pricing existed on these rows. Routing them through the generic Library would have
  // silently handed data_feeder both read and write access the rest of the app goes out of its way
  // to withhold — a regression, not a feature, however convenient one shared browser would be.
  // Visa countries are managed as Country entries (above) for everything that ISN'T visa-specific
  // (baseFee is deliberately excluded from Country's fields for the same reason); visa products,
  // their checklist and processing timeline are managed at /admin/visa-config, which already
  // enforces the correct roles and has done since before this Library existed.

  dayTemplate: {
    model: 'dayTemplate',
    entityType: 'DayTemplate',
    label: 'Day template',
    // Has a richer screen of its own inside the Library, so the generic browser does not list it —
    // otherwise the same entity appears twice with two different editors, which is precisely the
    // duplication this registry exists to prevent.
    dedicatedScreen: true,
    searchFields: ['title'],
    buildSearch: null,
    defaultOrder: [{ title: 'asc' }],
    scopeField: 'destinationId',
    toOption: (row) => option(row.id, row.title, row.brief, row.coverImageUrl, {
      destinationId: row.destinationId,
    }),
    // Events are the substance of a day template and need their own builder.
    fields: [],
    readOnly: true,
    commercialFields: [],
  },

  // -------------------------------------------------------------------------
  // Reusable content (Phase 4)
  // -------------------------------------------------------------------------

  documentType: {
    model: 'documentType',
    entityType: 'DocumentType',
    label: 'Document type',
    searchFields: ['name', 'description'],
    buildSearch: (row) => buildSearchText(row.name, row.description, row.requirementNotes),
    defaultOrder: [{ sortOrder: 'asc' }, { name: 'asc' }],
    toOption: (row) => option(row.id, row.name, row.category, row.sampleImageUrl, {
      category: row.category,
      subject: row.subject,
      isMandatoryByDefault: row.isMandatoryByDefault,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('slug', 'Slug', 'text', { createOnly: true }),
      field('category', 'Category', 'select', {
        // Same enum the visa filter runs on — the whole reason the checklist stopped being free text.
        options: ['PASSPORT', 'PHOTOGRAPH', 'FINANCIAL', 'EMPLOYMENT', 'TRAVEL', 'IDENTITY', 'OTHER'],
        hint: 'What the "documents required" filter groups it under.',
      }),
      field('subject', 'Required from', 'select', {
        options: ['TRAVELLER', 'BOOKING'],
        hint: 'Per traveller, or once per booking. Four passports vs one air ticket.',
      }),
      field('isMandatoryByDefault', 'Mandatory by default', 'boolean'),
      field('description', 'Description', 'textarea'),
      field('requirementNotes', 'Requirement notes', 'textarea', {
        hint: '"Valid for at least 6 months beyond the travel date."',
      }),
      field('sampleImageUrl', 'Sample', 'image', { hint: 'A specimen. Removes most rejected uploads.' }),
      field('sortOrder', 'Sort order', 'number', { default: 0 }),
    ],
    commercialFields: [],
  },

  faq: {
    model: 'faqItem',
    entityType: 'FaqItem',
    label: 'FAQ',
    // FaqItem has no 'name' column — bulk import matches an existing row by its question instead.
    naturalKey: 'question',
    searchFields: ['question', 'answer', 'category'],
    buildSearch: (row) => buildSearchText(row.question, row.answer, row.category),
    defaultOrder: [{ sortOrder: 'asc' }, { question: 'asc' }],
    // The list projects `question` as the label, so `summarise` in the shell needs no special case.
    toOption: (row) => option(row.id, row.question, row.category, null, { category: row.category }),
    fields: [
      field('question', 'Question', 'text', { required: true }),
      field('answer', 'Answer', 'textarea', { required: true, hint: 'Markdown.' }),
      field('category', 'Category', 'text', { hint: '"Before you fly", "Payments" — free text on purpose.' }),
      field('sortOrder', 'Sort order', 'number', { default: 0 }),
    ],
    commercialFields: [],
  },

  noteBlock: {
    model: 'noteBlock',
    entityType: 'NoteBlock',
    label: 'Note block',
    // 'key' is NoteBlock's real, permanent identity (see the field below) — matches the natural
    // key a human re-importing an export would recognise, unlike the database id.
    naturalKey: 'key',
    searchFields: ['title', 'body'],
    buildSearch: (row) => buildSearchText(row.title, row.key, row.body),
    defaultOrder: [{ sortOrder: 'asc' }, { title: 'asc' }],
    toOption: (row) => option(row.id, row.title, row.key, null, { type: row.type, isGlobal: row.isGlobal }),
    fields: [
      field('key', 'Key', 'text', {
        required: true,
        createOnly: true,
        hint: 'What documents look this block up by. Never changes.',
      }),
      field('title', 'Heading', 'text', { required: true }),
      field('type', 'Type', 'select', {
        options: [
          'TERMS_AND_CONDITIONS',
          'SCOPE_OF_SERVICES',
          'CANCELLATION_POLICY_TEXT',
          'AMENDMENT_POLICY',
          'GENERAL_NOTE',
          'TOURS_AND_TRANSFERS_NOTE',
          'VISA_NOTE',
          'PAYMENT_TERMS',
          'OTHER',
        ],
      }),
      field('body', 'Body', 'textarea', { required: true, hint: 'Markdown.' }),
      field('isGlobal', 'Printed on every document', 'boolean', {
        hint: 'Off means it applies only where it has been attached.',
      }),
      field('sortOrder', 'Sort order', 'number', { default: 0 }),
    ],
    commercialFields: [],
  },

  cancellationPolicy: {
    model: 'cancellationPolicy',
    entityType: 'CancellationPolicy',
    label: 'Cancellation policy',
    searchFields: ['name', 'description'],
    buildSearch: (row) => buildSearchText(row.name, row.description),
    defaultOrder: [{ name: 'asc' }],
    toOption: (row) => option(row.id, row.name, row.description, null, {}),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('slug', 'Slug', 'text', { createOnly: true }),
      field('description', 'Description', 'textarea'),
      field('notes', 'Printed notes', 'textarea', {
        hint: 'Wording the tier table cannot express. Printed alongside it.',
      }),
    ],
    // The bands are the policy. They have their own editor because a gap or an overlap between them
    // is a charge dispute, and the editor checks for both.
    childEditor: 'cancellation-tiers',
    commercialFields: [],
  },

  insurancePlan: {
    model: 'insurancePlan',
    entityType: 'InsurancePlan',
    label: 'Insurance plan',
    searchFields: ['name', 'provider'],
    buildSearch: (row) => buildSearchText(row.name, row.provider, row.coverageSummary),
    defaultOrder: [{ sortOrder: 'asc' }, { name: 'asc' }],
    toOption: (row) => option(row.id, row.name, row.provider, null, {
      currencyCode: row.currencyCode,
      premiumAdult: row.premiumAdult === null ? null : String(row.premiumAdult),
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('slug', 'Slug', 'text', { createOnly: true }),
      field('provider', 'Provider', 'text', { required: true }),
      field('currencyCode', 'Currency', 'picker', {
        entity: 'currency',
        hint: 'Applies to every amount on this plan.',
      }),
      field('coverageAmount', 'Coverage', 'number'),
      field('premiumAdult', 'Premium — adult', 'number'),
      field('premiumChild', 'Premium — child', 'number'),
      field('minAgeYears', 'Minimum age', 'number'),
      field('maxAgeYears', 'Maximum age', 'number', {
        hint: 'Age bands are where claims are actually refused, so they are fields rather than prose.',
      }),
      field('maxTripDays', 'Maximum trip length (days)', 'number'),
      field('coverageSummary', 'Coverage summary', 'textarea'),
      field('inclusions', 'Inclusions', 'textarea'),
      field('exclusions', 'Exclusions', 'textarea'),
      field('brochureUrl', 'Brochure', 'text'),
      field('sortOrder', 'Sort order', 'number', { default: 0 }),
    ],
    // A data feeder maintains the wording and the eligibility; only an admin prices it.
    commercialFields: ['premiumAdult', 'premiumChild', 'coverageAmount', 'currencyCode'],
  },

  // -------------------------------------------------------------------------
  // Suppliers and rates (Phase 5)
  // -------------------------------------------------------------------------

  vendor: {
    model: 'vendor',
    entityType: 'Vendor',
    label: 'Vendor',
    searchFields: ['name', 'contactPerson', 'email'],
    buildSearch: (row) => buildSearchText(row.name, row.contactPerson, row.email, row.phone),
    defaultOrder: [{ name: 'asc' }],
    toOption: (row) => option(row.id, row.name, row.contactPerson ?? row.email, null, {
      types: row.types,
      defaultCurrencyCode: row.defaultCurrencyCode,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('slug', 'Slug', 'text', { createOnly: true }),
      field('types', 'Supplies', 'tags', {
        hint: 'HOTEL_SUPPLIER, DMC, TRANSPORT, ACTIVITY, INSURANCE, VISA, OTHER — comma separated.',
      }),
      field('contactPerson', 'Contact person', 'text'),
      field('email', 'Email', 'text'),
      field('phone', 'Phone', 'text'),
      field('countryId', 'Country', 'picker', { entity: 'country' }),
      field('address', 'Address', 'textarea'),
      field('website', 'Website', 'text'),
      field('gstNumber', 'GST number', 'text'),
      field('panNumber', 'PAN number', 'text'),
      field('defaultCurrencyCode', 'Contracts in', 'picker', {
        entity: 'currency',
        hint: 'A default for new rate cards, not a constraint.',
      }),
      field('paymentTerms', 'Payment terms', 'text'),
      field('creditDays', 'Credit days', 'number'),
      field('notes', 'Notes', 'textarea'),
    ],
    // Payment terms are what the business owes and when. Not a data feeder's call.
    commercialFields: ['paymentTerms', 'creditDays', 'defaultCurrencyCode'],
  },

  activity: {
    model: 'activity',
    entityType: 'Activity',
    label: 'Activity',
    searchFields: ['name', 'description', 'category'],
    buildSearch: (row) => buildSearchText(row.name, row.category, row.description),
    defaultOrder: [{ name: 'asc' }],
    scopeField: 'destinationId',
    toOption: (row) => option(row.id, row.name, row.category, row.coverImageUrl, {
      destinationId: row.destinationId,
      durationMinutes: row.durationMinutes,
    }),
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('slug', 'Slug', 'text', { createOnly: true }),
      field('destinationId', 'Destination', 'picker', { entity: 'destination', required: true }),
      field('category', 'Category', 'text', { hint: 'Matched against the ACTIVITY_CATEGORY vocabulary.' }),
      field('durationMinutes', 'Duration (minutes)', 'number'),
      field('suggestedStartMinute', 'Usual start (minutes from midnight)', 'number', {
        hint: '540 = 09:00. Templates have no dates, so times are minutes.',
      }),
      field('coverImageUrl', 'Cover image', 'image'),
      field('description', 'Description', 'textarea'),
      field('meetingPoint', 'Meeting point', 'textarea'),
      field('inclusions', 'Inclusions', 'textarea'),
      field('exclusions', 'Exclusions', 'textarea'),
      field('notes', 'Notes', 'textarea'),
      field('minAgeYears', 'Minimum age', 'number'),
      field('maxPax', 'Maximum pax', 'number'),
    ],
    // The prices live on ActivityRate, which has its own editor for the same reason rate cards do.
    childEditor: 'activity-rates',
    commercialFields: [],
  },
};

function get(entity) {
  return REGISTRY[entity] ?? null;
}

function names() {
  return Object.keys(REGISTRY);
}

/**
 * Drops keys the entity does not declare as writable.
 *
 * The generic write endpoint reaches every column of every registered model, so without this a
 * caller could set `archived`, `searchText`, or any relation Prisma accepts as a scalar. Declared
 * fields are the contract; everything else is not a validation failure but simply not part of it.
 *
 * Returns the unknown keys so the controller can say what it ignored — a silent drop is how
 * "I saved it and it did not stick" starts.
 */
function stripUnknownFields(entity, payload, { isCreate = false } = {}) {
  const config = get(entity);

  if (!config?.fields?.length) return { data: payload, ignored: [] };

  const allowed = new Set(
    config.fields.filter((f) => isCreate || !f.createOnly).map((f) => f.name)
  );

  // A vocabulary is created into one type and never moved between them, so `type` is accepted on
  // create only — the same rule as a createOnly field, expressed where the filter can see it.
  if (isCreate && config.requiredFilter) allowed.add(config.requiredFilter);

  const data = {};
  const ignored = [];

  Object.entries(payload).forEach(([key, value]) => {
    if (allowed.has(key)) data[key] = value;
    else ignored.push(key);
  });

  return { data, ignored };
}

/**
 * Removes fields the actor is not allowed to write.
 *
 * Enforced here rather than by hiding inputs in the UI, because hiding a field is not a control —
 * anything that can reach the API can send it. A data feeder may write a hotel's description and a
 * visa product's document checklist, but not what either of them costs.
 *
 * Silently stripping rather than rejecting is deliberate: the admin form posts the whole object, so
 * a data feeder saving an unrelated edit would otherwise be blocked by a field they never touched.
 */
function stripForbiddenFields(entity, payload, user) {
  const config = get(entity);

  if (!config || user?.role === 'admin') return { data: payload, stripped: [] };

  const stripped = config.commercialFields.filter((field) => field in payload);
  const data = { ...payload };

  stripped.forEach((field) => delete data[field]);

  return { data, stripped };
}

module.exports = { REGISTRY, get, names, option, field, stripForbiddenFields, stripUnknownFields };
