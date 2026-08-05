/**
 * The shared ceiling for a "give me everything" request — a filter-chrome dropdown (destinations,
 * countries) that needs the full list rather than one page of it. Matches the backend's own
 * paginationSchema.MAX_LIMIT, since that is the largest a single response is ever allowed to be;
 * asking for more would just get clamped anyway.
 */
export const PICKER_FULL_LIST_LIMIT = 200;
