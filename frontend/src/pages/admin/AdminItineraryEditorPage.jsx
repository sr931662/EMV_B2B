import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '../../components/ui';
import { apiGet, apiPut, apiPatch, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';
import {
  EVENT_TYPE_OPTIONS,
  MEAL_OPTIONS,
  timeToMinute,
  minuteToTime,
  formatDuration,
} from '../../lib/itinerary';

/**
 * Builds the day-wise itinerary: one day at a time, each with its scheduled events and their
 * sub-events.
 *
 * Saves a whole day per submit, matching the API. An admin laying out a day retimes and reorders
 * several items before they are happy with any of them; saving row by row would leave the day
 * half-written whenever one call failed.
 */

const emptyEvent = () => ({
  key: crypto.randomUUID(),
  title: '',
  description: '',
  type: 'ACTIVITY',
  startTime: '',
  durationMinutes: '',
  mealsIncluded: [],
  availability: '',
  transferMode: '',
  luggageAllowance: '',
  subEvents: [],
});

const emptySubEvent = () => ({
  key: crypto.randomUUID(),
  title: '',
  description: '',
  type: 'ACTIVITY',
  startTime: '',
  durationMinutes: '',
  mealsIncluded: [],
  availability: '',
});

/** Strips the UI-only key and converts the form's "09:30" back into minutes for the API. */
function toPayload(event, includeSubEvents) {
  const payload = {
    title: event.title.trim(),
    description: event.description.trim() || null,
    type: event.type,
    startMinute: timeToMinute(event.startTime),
    durationMinutes: event.durationMinutes === '' ? null : Number(event.durationMinutes),
    mealsIncluded: event.mealsIncluded,
    availability: event.availability.trim() || null,
  };

  // Transfer detail is only meaningful on a transfer, and sending it on an activity would put
  // fields on a row nothing ever reads.
  if (event.type === 'TRANSFER') {
    payload.transferMode = event.transferMode?.trim() || null;
    payload.luggageAllowance = event.luggageAllowance?.trim() || null;
  }

  if (includeSubEvents) {
    payload.subEvents = event.subEvents.filter((s) => s.title.trim()).map((s) => toPayload(s, false));
  }

  return payload;
}

function MealPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-3">
      {MEAL_OPTIONS.map((meal) => (
        <label key={meal.value} className="flex items-center gap-1.5 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            checked={value.includes(meal.value)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, meal.value]
                  : value.filter((m) => m !== meal.value)
              )
            }
          />
          {meal.label}
        </label>
      ))}
    </div>
  );
}

function EventEditor({ event, onChange, onRemove, nested = false }) {
  const set = (field) => (e) => onChange({ ...event, [field]: e.target.value });

  return (
    <div className={`rounded-lg border p-3 ${nested ? 'border-neutral-200 bg-neutral-50' : 'border-neutral-300'}`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Input label="Title" value={event.title} onChange={set('title')} />
            </div>
            <Select label="Type" value={event.type} onChange={set('type')} options={EVENT_TYPE_OPTIONS} />
            <Input
              label="Start time"
              type="time"
              value={event.startTime}
              onChange={set('startTime')}
              hint="Time of day, not a date"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Duration (minutes)"
              type="number"
              min="0"
              max="1440"
              value={event.durationMinutes}
              onChange={set('durationMinutes')}
              hint={formatDuration(Number(event.durationMinutes)) ?? undefined}
            />
            <Input
              label="Availability"
              value={event.availability}
              onChange={set('availability')}
              hint='e.g. "Daily", "Not on Mondays"'
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">Meals included</span>
              <MealPicker
                value={event.mealsIncluded}
                onChange={(meals) => onChange({ ...event, mealsIncluded: meals })}
              />
            </div>
          </div>

          {/* Only for transfers — the fields are meaningless on any other kind of event. */}
          {event.type === 'TRANSFER' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Vehicle / mode"
                value={event.transferMode ?? ''}
                onChange={set('transferMode')}
                hint='e.g. "Private sedan". Not the booked vehicle number — that lives on the trip.'
              />
              <Input
                label="Luggage allowance"
                value={event.luggageAllowance ?? ''}
                onChange={set('luggageAllowance')}
              />
            </div>
          )}

          <Textarea label="Description" rows={2} value={event.description} onChange={set('description')} />

          {!nested && (
            <div className="flex flex-col gap-2">
              {event.subEvents.map((sub, i) => (
                <EventEditor
                  key={sub.key}
                  event={sub}
                  nested
                  onChange={(next) => {
                    const subs = [...event.subEvents];
                    subs[i] = next;
                    onChange({ ...event, subEvents: subs });
                  }}
                  onRemove={() =>
                    onChange({ ...event, subEvents: event.subEvents.filter((_, j) => j !== i) })
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => onChange({ ...event, subEvents: [...event.subEvents, emptySubEvent()] })}
              >
                <Icon name="plus" size={13} />
                Add stop within this event
              </Button>
            </div>
          )}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={onRemove}>
          <Icon name="trash" size={14} />
        </Button>
      </div>
    </div>
  );
}

/**
 * The day's own card — title, brief, description, notes, inclusions, meals — as opposed to its
 * scheduled events below. Previously nothing on this page let an admin touch these at all: they
 * were frozen in at the moment the day template was added to the package (locked rule 2) and
 * could only be changed by replacing the whole itinerary. This is what "Notes" on the itinerary
 * card means, and the fix for not being able to edit a day beyond its events.
 */
function DayDetailsEditor({ day, onSaved }) {
  const [fields, setFields] = useState({
    title: day.title ?? '',
    brief: day.brief ?? '',
    description: day.description ?? '',
    notes: day.notes ?? '',
    inclusions: day.inclusions ?? '',
    mealsIncluded: day.mealsIncluded ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const set = (field) => (e) => setFields((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/packages/days/${day.id}`, {
        title: fields.title.trim(),
        brief: fields.brief.trim() || null,
        description: fields.description.trim(),
        notes: fields.notes.trim() || null,
        inclusions: fields.inclusions.trim() || null,
        mealsIncluded: fields.mealsIncluded,
      });
      showToast({ variant: 'success', message: `Day ${day.dayNumber} card saved.` });
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-300 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Day card</p>
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Title" value={fields.title} onChange={set('title')} />
        <Input
          label="Brief"
          value={fields.brief}
          onChange={set('brief')}
          hint="One-line summary shown before the day expands."
        />
      </div>
      <Textarea label="Description" rows={3} value={fields.description} onChange={set('description')} />
      <Textarea
        label="Notes"
        rows={2}
        value={fields.notes}
        onChange={set('notes')}
        hint='Operational caveats shown as a highlighted warning on the itinerary — e.g. "carry swimwear".'
      />
      <Textarea
        label="Inclusions for this day"
        rows={2}
        value={fields.inclusions}
        onChange={set('inclusions')}
        hint="What THIS day covers — the package's trip-wide inclusions live on the package form instead."
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-neutral-700">Meals included this day</span>
        <MealPicker
          value={fields.mealsIncluded}
          onChange={(meals) => setFields((prev) => ({ ...prev, mealsIncluded: meals }))}
        />
      </div>
      <Button type="button" size="sm" loading={saving} className="w-fit" onClick={handleSave}>
        Save day card
      </Button>
    </div>
  );
}

function DayEditor({ day, onSaved }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setLoading(true);

    apiGet(`/api/packages/days/${day.id}/events`)
      .then((res) => {
        if (cancelled) return;
        setEvents(
          res.events.map((e) => ({
            key: e.id,
            title: e.title,
            description: e.description ?? '',
            type: e.type,
            startTime: minuteToTime(e.startMinute),
            durationMinutes: e.durationMinutes ?? '',
            mealsIncluded: e.mealsIncluded ?? [],
            availability: e.availability ?? '',
            transferMode: e.transferMode ?? '',
            luggageAllowance: e.luggageAllowance ?? '',
            subEvents: (e.subEvents ?? []).map((s) => ({
              key: s.id,
              title: s.title,
              description: s.description ?? '',
              type: s.type,
              startTime: minuteToTime(s.startMinute),
              durationMinutes: s.durationMinutes ?? '',
              mealsIncluded: s.mealsIncluded ?? [],
              availability: s.availability ?? '',
            })),
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load this day.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, day.id]);

  const handleSave = async () => {
    const named = events.filter((e) => e.title.trim());

    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/packages/days/${day.id}/events`, {
        events: named.map((e) => toPayload(e, true)),
      });
      showToast({ variant: 'success', message: `Day ${day.dayNumber} saved.` });
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="text-[12px] uppercase tracking-wide text-primary-700">
            Day {day.dayNumber}
          </span>
          <span className="ml-2 text-[15px] font-medium text-neutral-900">{day.title}</span>
        </span>
        <span className="flex items-center gap-2">
          {open && <Badge variant="neutral">{events.length} events</Badge>}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
        </span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4 border-t border-neutral-100 pt-4">
          <DayDetailsEditor day={day} onSaved={onSaved} />

          {error && <Alert variant="danger">{error}</Alert>}

          {loading ? (
            <Skeleton.Stat />
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Scheduled events
              </p>

              {events.length === 0 && (
                <p className="text-[13px] text-neutral-500">
                  No events yet. The itinerary page shows this day with its description only.
                </p>
              )}

              {events.map((event, i) => (
                <EventEditor
                  key={event.key}
                  event={event}
                  onChange={(next) => {
                    const list = [...events];
                    list[i] = next;
                    setEvents(list);
                  }}
                  onRemove={() => setEvents(events.filter((_, j) => j !== i))}
                />
              ))}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEvents([...events, emptyEvent()])}
                >
                  <Icon name="plus" size={15} />
                  Add event
                </Button>
                <Button loading={saving} onClick={handleSave}>
                  Save day {day.dayNumber}
                </Button>
              </div>

              <p className="text-[12px] text-neutral-500">
                Order is taken from the list above. Times are times of day — the calendar date comes
                from whichever departure the itinerary is viewed for.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function AdminItineraryEditorPage() {
  const { id } = useParams();
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    return apiGet(`/api/packages/${id}/itinerary`)
      .then((res) => setItinerary(res.itinerary))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the package.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <Skeleton.Stat />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!itinerary) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/packages"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
      >
        <Icon name="arrow-left" size={14} />
        All packages
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
            Itinerary — {itinerary.package.title}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {itinerary.package.countryName} · {itinerary.package.days} days ·{' '}
            {itinerary.package.nights} nights
          </p>
          <p className="mt-1 text-sm text-neutral-700">
            <span className="font-medium text-neutral-900">
              Adult: {formatCurrency(itinerary.package.adultRawPrice)}
            </span>
            <span className="mx-1.5 text-neutral-300">·</span>
            Child:{' '}
            {Number(itinerary.package.childRawPrice) === 0
              ? 'Free'
              : formatCurrency(itinerary.package.childRawPrice)}
            <span className="ml-1.5 text-neutral-400">(wholesale, per head)</span>
          </p>
        </div>
        <Button as={Link} to={`/packages/${id}/itinerary`} variant="outline">
          <Icon name="eye" size={15} />
          Preview
        </Button>
      </div>

      <Alert variant="info">
        Each day is saved on its own. Open a day to edit its own card (title, brief, notes,
        inclusions, meals) and its scheduled events separately. Sub-events nest one level deep — a
        day tour with three stops is one event with three stops inside it.
      </Alert>

      <div className="flex flex-col gap-3">
        {itinerary.days.map((day) => (
          <DayEditor key={day.dayNumber} day={{ ...day, id: day.id }} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

export default AdminItineraryEditorPage;
