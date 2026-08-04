import { Button, Card, Icon, Input, Select } from '../ui';
import {
  DURATION_OPTIONS,
  VISA_CATEGORY_OPTIONS,
  DOCUMENT_PROFILE_OPTIONS,
} from '../../lib/visaProducts';

/**
 * The marketplace filter bar.
 *
 * Controlled by the page, which keeps the values in the URL — a filtered view is then a link a
 * partner can send to a colleague, and the back button steps through filter changes instead of
 * leaving the page.
 *
 * The travel-date field is deliberately not a fifth "duration" control. A partner does not
 * naturally know whether they need a 5-day or 7-day visa; they know when their client flies. The
 * server turns that date into a per-product "ready in time / too late" answer, which is the
 * question actually being asked.
 */
function VisaProductFilters({ value, onChange, onReset, resultCount, loading }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  const hasFilters = Boolean(
    value.maxProcessingDays || value.category || value.documentProfile || value.travelDate
  );

  // Guard the date picker's lower bound: the API rejects a past travelDate, and offering dates it
  // will refuse is a worse experience than not offering them.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Visa delivery duration"
          value={value.maxProcessingDays}
          onChange={set('maxProcessingDays')}
          options={DURATION_OPTIONS}
        />
        <Select
          label="Type of visa"
          value={value.category}
          onChange={set('category')}
          options={VISA_CATEGORY_OPTIONS}
        />
        <Select
          label="Documents available"
          value={value.documentProfile}
          onChange={set('documentProfile')}
          options={DOCUMENT_PROFILE_OPTIONS}
          hint="What your client can provide"
        />
        <Input
          label="Travel date"
          type="date"
          min={today}
          value={value.travelDate}
          onChange={set('travelDate')}
          hint="Shows what arrives in time"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <div className="flex items-center gap-4">
          {value.travelDate && (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={value.onlyFeasible}
                onChange={(e) => onChange({ ...value, onlyFeasible: e.target.checked })}
              />
              Hide visas that cannot arrive in time
            </label>
          )}
          <span className="text-sm text-neutral-500">
            {loading ? 'Searching…' : `${resultCount} ${resultCount === 1 ? 'visa' : 'visas'}`}
          </span>
        </div>

        {hasFilters && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <Icon name="x" size={14} />
            Clear filters
          </Button>
        )}
      </div>
    </Card>
  );
}

export default VisaProductFilters;
