import { Link } from 'react-router-dom';
import { Badge, Icon } from '../ui';
import PackageImage from './PackageImage';
import { formatCurrency } from '../../lib/format';

/**
 * Marketplace grid tile — also reused for the dashboard's "latest packages" teaser.
 *
 * Composition notes:
 *  - The whole tile is one link with a single hover state (lift + image zoom + title colour), so
 *    the card reads as one target instead of a box containing a link.
 *  - The image carries a bottom gradient scrim with the duration chip on top of it. Putting the
 *    metadata over the photo buys vertical space and is what makes this look like a travel
 *    product rather than a CRM row.
 *  - Price sits in a footer separated by a hairline, right-aligned and tabular, so a row of tiles
 *    forms a scannable price column.
 */
function PackageCard({ pkg }) {
  return (
    <Link
      to={`/packages/${pkg.id}`}
      className="group surface flex h-full flex-col overflow-hidden rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2"
    >
      <div className="relative overflow-hidden">
        <PackageImage
          src={pkg.gallery?.[0]}
          alt={pkg.title}
          className="h-40 w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />

        {/* Scrim so the chip stays readable over any photo. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-neutral-950/65 to-transparent"
        />

        <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/95">
            <Icon name="map-pin" size={13} className="opacity-80" />
            <span className="truncate">{pkg.destination?.name ?? 'Destination'}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm ring-1 ring-inset ring-white/25">
            {pkg.days}D / {pkg.nights}N
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-neutral-900 transition-colors group-hover:text-primary-700">
          {pkg.title}
        </h3>

        {pkg.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pkg.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* mt-auto pins the price to the bottom so tiles of differing title length stay aligned. */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-neutral-150 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              TravNexa cost / adult
            </p>
            <p className="text-[17px] font-semibold leading-tight text-neutral-900 tabular-nums">
              {formatCurrency(pkg.adultRawPrice)}
            </p>
            {Number(pkg.childRawPrice) > 0 && (
              <p className="text-[11px] text-neutral-500 tabular-nums">
                {formatCurrency(pkg.childRawPrice)} / child
              </p>
            )}
          </div>
          <span className="mb-0.5 flex size-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 transition-colors group-hover:bg-primary-600 group-hover:text-white">
            <Icon name="arrow-right" size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default PackageCard;
