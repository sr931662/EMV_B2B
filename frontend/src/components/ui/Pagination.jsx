import Button from './Button';
import Icon from './Icon';
import { cn } from '../../lib/cn';

/**
 * Page-through control for every list screen in the app.
 *
 * Deliberately prev/next + "Page X of Y" rather than numbered page buttons: several lists here
 * (audit logs, payments, the Library) run into the hundreds or thousands of rows, and a numbered
 * strip either has to truncate awkwardly or grow unbounded. One shape that works at 3 pages and at
 * 3,000 avoids a screen-by-screen judgment call about which style it "deserves".
 *
 * Controlled, not stateful: the caller owns `page` (1-indexed) and re-fetches on change. This
 * component only ever renders what it's told and asks for a page/size change.
 */
function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  loading = false,
  className = '',
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  const goTo = (next) => {
    const clamped = Math.min(Math.max(1, next), pageCount);
    if (clamped !== page) onPageChange(clamped);
  };

  // Nothing to page through — most lists spend most of their life here, and a disabled control
  // bar sitting under nine rows reads as broken, not as "you've seen everything".
  if (total <= pageSize && !pageSizeOptions) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3',
        className
      )}
    >
      <div className="flex items-center gap-3 text-[12.5px] text-neutral-500">
        <span className="tabular-nums">
          {total === 0 ? 'No results' : `${start}–${end} of ${total}`}
        </span>

        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-neutral-200 bg-white px-1.5 text-[12.5px] text-neutral-700"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => goTo(page - 1)}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" size={14} />
          Prev
        </Button>
        <span className="min-w-[5.5rem] text-center text-[12.5px] tabular-nums text-neutral-500">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount || loading}
          onClick={() => goTo(page + 1)}
          aria-label="Next page"
        >
          Next
          <Icon name="chevron-right" size={14} />
        </Button>
      </div>
    </div>
  );
}

export default Pagination;
