import { Badge, Button, Card } from '../ui';

/** Hotel selection, ordered by pick order (sortOrder). Same copy-on-select contract as the
 * day-template picker — only the id is sent, the backend copies name/category/description. */
function HotelPicker({ availableHotels, selected, onAdd, onRemove, onMove }) {
  const hotelById = new Map(availableHotels.map((h) => [h.id, h]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Available hotels
        </h4>
        {availableHotels.length === 0 ? (
          <Card bodyClassName="py-6 text-center">
            <p className="text-sm text-neutral-400">No hotels for this destination yet.</p>
          </Card>
        ) : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {availableHotels.map((h) => (
              <Card key={h.id} bodyClassName="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{h.name}</p>
                  <Badge variant="info">{h.category}</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => onAdd(h.id)} className="flex-none">
                  Add
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Selected hotels ({selected.length})
        </h4>
        {selected.length === 0 ? (
          <Card bodyClassName="py-6 text-center">
            <p className="text-sm text-neutral-400">Add hotels from the left — order is preserved.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {selected.map((entry, i) => {
              const hotel = hotelById.get(entry.hotelId);
              return (
                <Card key={entry.key} bodyClassName="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {hotel?.name ?? '(hotel no longer available)'}
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
                      disabled={i === selected.length - 1}
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
  );
}

export default HotelPicker;
