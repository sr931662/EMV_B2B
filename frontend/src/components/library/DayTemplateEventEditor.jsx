import { useEffect, useState } from 'react';
import { Alert, Button, Icon, Input, Select, Skeleton, Textarea, useToast } from '../ui';
import LibraryPicker from './LibraryPicker';
import { apiGet, apiPut, ApiError } from '../../api/client';
import { EVENT_TYPE_OPTIONS, MEAL_OPTIONS, timeToMinute, minuteToTime, formatDuration } from '../../lib/itinerary';

/**
 * The day-by-day events inside one day template — its actual content, as opposed to the
 * title/description DayTemplatesTab's own form edits. Same shape as a package's own itinerary-day
 * editor (`AdminItineraryEditorPage.jsx`'s `EventEditor`/`DayEditor`) because the two models are
 * field-for-field siblings — `packageService.copyEvent()` copies one into the other at
 * package-build time — with one addition here: `activityId`, a real library reference, since a
 * template IS the library rather than a frozen copy of it (locked rule 2 only applies once this
 * gets copied into a package).
 */

const emptyEvent = () => ({
  key: crypto.randomUUID(),
  title: '',
  description: '',
  type: 'ACTIVITY',
  activityId: '',
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
  activityId: '',
  startTime: '',
  durationMinutes: '',
  mealsIncluded: [],
  availability: '',
});

function fromApi(e) {
  return {
    key: e.id,
    title: e.title,
    description: e.description ?? '',
    type: e.type,
    activityId: e.activityId ?? '',
    startTime: minuteToTime(e.startMinute),
    durationMinutes: e.durationMinutes ?? '',
    mealsIncluded: e.mealsIncluded ?? [],
    availability: e.availability ?? '',
    transferMode: e.transferMode ?? '',
    luggageAllowance: e.luggageAllowance ?? '',
  };
}

/** Strips the UI-only key and converts the form's "09:30" back into minutes for the API. */
function toPayload(event, includeSubEvents) {
  const payload = {
    title: event.title.trim(),
    description: event.description.trim() || null,
    type: event.type,
    activityId: event.activityId || null,
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
              onChange(e.target.checked ? [...value, meal.value] : value.filter((m) => m !== meal.value))
            }
          />
          {meal.label}
        </label>
      ))}
    </div>
  );
}

function EventEditor({ event, destinationId, onChange, onRemove, nested = false }) {
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

          <LibraryPicker
            entity="activity"
            label="Library activity"
            value={event.activityId}
            onChange={(activityId) => onChange({ ...event, activityId: activityId ?? '' })}
            scopeId={destinationId || undefined}
            placeholder="Optional — link this event to a priceable activity"
            hint="Links this event to an Activity in the library, so it can be counted and priced. Leave blank for a plain itinerary line."
            allowCreate={false}
          />

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
                hint='e.g. "Private sedan"'
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
                  destinationId={destinationId}
                  nested
                  onChange={(next) => {
                    const subs = [...event.subEvents];
                    subs[i] = next;
                    onChange({ ...event, subEvents: subs });
                  }}
                  onRemove={() => onChange({ ...event, subEvents: event.subEvents.filter((_, j) => j !== i) })}
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

function DayTemplateEventEditor({ dayTemplateId, destinationId, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiGet(`/api/day-templates/${dayTemplateId}/events`)
      .then((res) => {
        if (!cancelled) {
          setEvents(res.events.map((e) => ({ ...fromApi(e), subEvents: (e.subEvents ?? []).map(fromApi) })));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load events.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dayTemplateId]);

  const handleSave = async () => {
    const named = events.filter((e) => e.title.trim());

    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/day-templates/${dayTemplateId}/events`, {
        events: named.map((e) => toPayload(e, true)),
      });
      showToast({ variant: 'success', message: 'Itinerary saved.' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton.Stat />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-neutral-500">
        What happens on this day, in order. A package that includes this template copies these
        events in at build time (locked rule 2) — editing here changes what the next package built
        from this template starts with, never a package already built.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      {events.length === 0 && (
        <p className="text-[13px] text-neutral-500">
          No events yet. A package built from this template will show this day with its description
          only.
        </p>
      )}

      {events.map((event, i) => (
        <EventEditor
          key={event.key}
          event={event}
          destinationId={destinationId}
          onChange={(next) => {
            const list = [...events];
            list[i] = next;
            setEvents(list);
          }}
          onRemove={() => setEvents(events.filter((_, j) => j !== i))}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button type="button" variant="outline" onClick={() => setEvents([...events, emptyEvent()])}>
          <Icon name="plus" size={15} />
          Add event
        </Button>
        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
          <Button loading={saving} onClick={handleSave}>
            Save itinerary
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DayTemplateEventEditor;
