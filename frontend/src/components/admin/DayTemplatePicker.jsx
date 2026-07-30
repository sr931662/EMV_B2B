import { Alert, Badge, Button, Card } from '../ui';

/**
 * The itinerary builder: pick from the destination's day-template library on the left,
 * build the ordered day-by-day sequence on the right. Selecting a template here only ever
 * sends its id — the backend COPIES the title+description onto the package at submit time
 * (locked rule 2), so nothing here is a live link back to the library.
 */
function DayTemplatePicker({ availableTemplates, itinerary, targetDays, onAdd, onRemove, onMove }) {
  const templateById = new Map(availableTemplates.map((t) => [t.id, t]));
  const countMismatch = targetDays !== '' && Number(targetDays) !== itinerary.length;

  return (
    <div className="flex flex-col gap-4">
      {countMismatch && (
        <Alert variant="warning">
          You&apos;ve selected {itinerary.length} day{itinerary.length === 1 ? '' : 's'} but the
          &quot;Days&quot; field says {targetDays}. These must match before you can submit.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Available day templates
          </h4>
          {availableTemplates.length === 0 ? (
            <Card bodyClassName="py-6 text-center">
              <p className="text-sm text-neutral-400">No day templates for this destination yet.</p>
            </Card>
          ) : (
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
              {availableTemplates.map((t) => (
                <Card key={t.id} bodyClassName="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{t.title}</p>
                    <p className="line-clamp-1 text-xs text-neutral-500">{t.description}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onAdd(t.id)} className="flex-none">
                    Add
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Itinerary ({itinerary.length} day{itinerary.length === 1 ? '' : 's'})
          </h4>
          {itinerary.length === 0 ? (
            <Card bodyClassName="py-6 text-center">
              <p className="text-sm text-neutral-400">Add day templates from the left to build the itinerary.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {itinerary.map((entry, i) => {
                const template = templateById.get(entry.templateId);
                return (
                  <Card key={entry.key} bodyClassName="flex items-center gap-3 py-3">
                    <Badge variant="primary">{i + 1}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {template?.title ?? '(template no longer available)'}
                      </p>
                    </div>
                    <div className="flex flex-none gap-1">
                      <button
                        type="button"
                        onClick={() => onMove(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(i, 1)}
                        disabled={i === itinerary.length - 1}
                        aria-label="Move down"
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(entry.key)}
                        aria-label="Remove"
                        className="rounded p-1 text-danger-500 hover:bg-danger-50"
                      >
                        ✕
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DayTemplatePicker;
