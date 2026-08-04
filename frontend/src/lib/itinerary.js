/*
 * Shared vocabulary for the day-wise itinerary. Keys must stay in step with DayEventType and
 * MealType in backend/prisma/schema.prisma.
 */

export const EVENT_TYPE_LABELS = {
  ARRIVAL: 'Arrival',
  CHECK_IN: 'Check in',
  TRANSFER: 'Transfer',
  SIGHTSEEING: 'Sightseeing',
  ACTIVITY: 'Activity',
  MEAL: 'Meal',
  LEISURE: 'Leisure',
  CHECK_OUT: 'Check out',
  OVERNIGHT: 'Overnight',
  DEPARTURE: 'Departure',
};

export const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// One icon per kind, so a reader can scan the day without reading every label.
export const EVENT_TYPE_ICONS = {
  ARRIVAL: 'plane',
  CHECK_IN: 'building',
  TRANSFER: 'card',
  SIGHTSEEING: 'map-pin',
  ACTIVITY: 'sparkles',
  MEAL: 'package',
  LEISURE: 'clock',
  CHECK_OUT: 'building',
  OVERNIGHT: 'clock',
  DEPARTURE: 'plane',
};

export const MEAL_LABELS = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
};

export const MEAL_OPTIONS = Object.entries(MEAL_LABELS).map(([value, label]) => ({ value, label }));

/** "09:30" -> 570. Blank stays null so "no time set" survives a round trip through the form. */
export function timeToMinute(value) {
  if (!value) return null;

  const [hours, minutes] = String(value).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  return hours * 60 + minutes;
}

/** 570 -> "09:30", for <input type="time">. */
export function minuteToTime(minute) {
  if (minute === null || minute === undefined) return '';

  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** "3h 30m" / "45m" — durations read better than a raw minute count. */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === 0) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;

  return `${hours}h ${mins}m`;
}

/** "09:00 – 10:00" when both are known, "09:00" when only the start is. */
export function formatTimeRange(startTime, endTime) {
  if (!startTime) return null;

  return endTime ? `${startTime} – ${endTime}` : startTime;
}

/** Star rating as filled/empty out of 5, or null when the admin has not rated the hotel. */
export function starsOutOfFive(rating) {
  if (rating === null || rating === undefined) return null;

  const filled = Math.max(0, Math.min(5, Math.round(rating)));

  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/**
 * Refundable is deliberately three-state on the server: true, false, and null for "not stated".
 * The UI must not collapse null into "non-refundable" — that would assert a cancellation stance
 * nobody entered.
 */
export function describeRefundable(refundable) {
  if (refundable === true) return { label: 'Refundable', variant: 'success' };
  if (refundable === false) return { label: 'Non-refundable', variant: 'danger' };

  return null;
}
