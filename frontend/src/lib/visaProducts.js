/*
 * Shared vocabulary for visa products — the labels the UI shows for the enums the API returns.
 *
 * One place on purpose: the admin form, the marketplace filters and the request pages all render
 * the same categories, and three copies of "Sticker Visa" would drift apart the first time someone
 * renamed one. The keys must stay in step with VisaCategory / VisaDocumentCategory in
 * backend/prisma/schema.prisma and with visaProductService.DOCUMENT_PROFILES.
 */

export const VISA_CATEGORY_LABELS = {
  VISA_FREE: 'Visa free',
  VISA_ON_ARRIVAL: 'Visa on arrival',
  E_VISA: 'eVisa',
  STICKER_VISA: 'Sticker visa',
};

// "All type" is the marketplace's no-filter option — it is not a category the API accepts, so it
// carries an empty value and is stripped before the request is built.
export const VISA_CATEGORY_OPTIONS = [
  { value: '', label: 'All types' },
  ...Object.entries(VISA_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

export const DOCUMENT_CATEGORY_LABELS = {
  PASSPORT: 'Passport',
  BANK_STATEMENT: 'Bank statement',
  INCOME_TAX_RETURN: 'Income tax return',
  PRIOR_VISA: 'US / UK / Schengen visa',
  PHOTO: 'Photograph',
  OTHER: 'Other',
};

export const DOCUMENT_CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label })
);

// Derived server-side from a product's checklist; never sent when creating one.
export const DOCUMENT_PROFILE_LABELS = {
  ONLY_PASSPORT: 'Only passport',
  PASSPORT_BANK: 'Passport & bank statements',
  PASSPORT_BANK_ITR: 'Passport, bank statements & ITR',
  WITH_PRIOR_VISA: 'With US/UK/Schengen visa',
};

// Ordered easiest-first, matching the server's ladder. Picking one means "my client can provide at
// most this much paperwork", so the API returns everything at or below it.
export const DOCUMENT_PROFILE_OPTIONS = [
  { value: '', label: 'Any documents' },
  ...Object.entries(DOCUMENT_PROFILE_LABELS).map(([value, label]) => ({ value, label })),
];

/*
 * The duration buckets from the brief, expressed as the single number the API filters on
 * (`maxProcessingDays` = "no slower than this").
 *
 * They nest deliberately — picking "within a month" also returns the instant ones — which is why
 * the server stores a number of working days rather than the bucket itself.
 */
export const DURATION_OPTIONS = [
  { value: '', label: 'Any duration' },
  { value: '0', label: 'Instant' },
  { value: '1', label: 'Within a day' },
  { value: '5', label: 'Within 3 to 5 working days' },
  { value: '7', label: 'Within a week' },
  { value: '30', label: 'Within a month' },
];

export const ENTRY_TYPE_LABELS = {
  SINGLE: 'Single entry',
  MULTIPLE: 'Multiple entry',
};

export const PASSENGER_TYPE_LABELS = {
  ADULT: 'Adult',
  CHILD: 'Child',
};

export const PASSENGER_TYPE_OPTIONS = Object.entries(PASSENGER_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

/**
 * Three different day counts live on a product and are easy to mix up, so each gets its own
 * formatter rather than one generic "days" helper that callers could point at the wrong field.
 */
export function formatValidity(validityDays) {
  if (validityDays === null || validityDays === undefined) return null;
  return validityDays % 365 === 0
    ? `${validityDays / 365} year${validityDays === 365 ? '' : 's'} validity`
    : `${validityDays} days validity`;
}

export function formatMaxStay(maxStayDays) {
  if (maxStayDays === null || maxStayDays === undefined) return null;
  return `${maxStayDays}-day stay`;
}

/** "3–5 working days" / "Instant" / "Timeline not published" for a product card. */
export function formatProcessingTime({ processingDaysMin, processingDaysMax }) {
  if (processingDaysMax === null || processingDaysMax === undefined) return 'Timeline not published';
  if (processingDaysMax === 0) return 'Instant';

  const min = processingDaysMin ?? processingDaysMax;
  const unit = processingDaysMax === 1 ? 'working day' : 'working days';

  return min === processingDaysMax
    ? `${processingDaysMax} ${unit}`
    : `${min}–${processingDaysMax} ${unit}`;
}

/** Badge tone + copy for the travel-date answer the API attaches to each product. */
export function describeFeasibility(feasibility) {
  if (!feasibility) return null;

  switch (feasibility.status) {
    case 'READY_IN_TIME':
      return { variant: 'success', label: 'Ready in time' };
    case 'TOO_LATE':
      return {
        variant: 'danger',
        label: `${feasibility.shortfallDays} working ${
          feasibility.shortfallDays === 1 ? 'day' : 'days'
        } short`,
      };
    case 'UNKNOWN':
    default:
      return { variant: 'neutral', label: 'Timeline not published' };
  }
}
