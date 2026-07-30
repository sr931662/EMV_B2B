import { Link } from 'react-router-dom';
import { Badge, Card } from '../ui';
import PackageImage from './PackageImage';
import { formatCurrency } from '../../lib/format';

/** Marketplace grid tile — also reused for the dashboard's "latest packages" teaser. */
function PackageCard({ pkg }) {
  return (
    <Link to={`/packages/${pkg.id}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md" bodyClassName="p-0">
        <PackageImage
          src={pkg.gallery?.[0]}
          alt={pkg.title}
          className="h-40 w-full rounded-t-xl"
        />
        <div className="flex flex-col gap-2 p-4">
          <h3 className="line-clamp-2 font-semibold text-neutral-900 group-hover:text-primary-700">
            {pkg.title}
          </h3>
          <p className="text-sm text-neutral-500">
            {pkg.destination?.name} &middot; {pkg.days}D/{pkg.nights}N
          </p>

          {pkg.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pkg.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-1 border-t border-neutral-100 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">TravNexa Cost</p>
            <p className="text-lg font-semibold text-neutral-900">{formatCurrency(pkg.rawPrice)}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default PackageCard;
