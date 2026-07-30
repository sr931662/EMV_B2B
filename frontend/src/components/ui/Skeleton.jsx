import { cn } from '../../lib/cn';

/**
 * Shimmer placeholders for loading states.
 *
 * Replacing a centred spinner with skeletons that match the shape of the incoming content is the
 * single biggest perceived-performance win available here: the page stops "flashing empty then
 * jumping", and the layout is already correct when data lands. The shimmer itself is the
 * `.skeleton` class in src/index.css.
 */
function Skeleton({ className = '', rounded = 'md' }) {
  const radius = { sm: 'rounded', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' };
  return <div aria-hidden="true" className={cn('skeleton', radius[rounded] ?? radius.md, className)} />;
}

/** A paragraph of fake text. The last line is shortened so it reads as prose, not a block. */
function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/5' : 'w-full')}
        />
      ))}
    </div>
  );
}

/** Matches the StatCard footprint, for dashboard tiles. */
function SkeletonStat() {
  return (
    <div className="surface flex flex-col gap-3 rounded-xl p-4">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-2.5 w-28" />
    </div>
  );
}

/** Matches PackageCard: image band, title, meta, price. */
function SkeletonCard() {
  return (
    <div className="surface overflow-hidden rounded-xl">
      <Skeleton className="h-40 w-full" rounded="sm" />
      <div className="flex flex-col gap-2.5 p-4">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-2.5 w-2/5" />
        <div className="mt-2 flex flex-col gap-2 border-t border-neutral-150 pt-3">
          <Skeleton className="h-2 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    </div>
  );
}

/** Rows sized to the Table primitive's cell padding, so nothing shifts when real rows arrive. */
function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={r}
          className="flex items-center gap-4 border-b border-neutral-150 px-1 py-3.5 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              // eslint-disable-next-line react/no-array-index-key
              key={c}
              className={cn('h-3', c === 0 ? 'w-1/3' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

Skeleton.Text = SkeletonText;
Skeleton.Stat = SkeletonStat;
Skeleton.Card = SkeletonCard;
Skeleton.Rows = SkeletonRows;

export default Skeleton;
