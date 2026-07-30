import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  PageHeader,
  Skeleton,
  useToast,
} from '../../components/ui';
import PackageImage from '../../components/packages/PackageImage';
import MarkdownContent from '../../components/shared/MarkdownContent';
import { apiGet, apiDownload, ApiError } from '../../api/client';
import { formatCurrency, slugify, splitTextBlock } from '../../lib/format';
import { cn } from '../../lib/cn';

/**
 * One itinerary day. Native <details> rather than a JS accordion — it's keyboard accessible and
 * Ctrl-F-searchable for free, and browsers now expand a closed <details> to reveal a find-in-page
 * match, which a state-driven version breaks.
 */
function ItineraryDay({ day, defaultOpen }) {
  return (
    <details
      className={cn(
        'surface group overflow-hidden rounded-xl transition-shadow',
        'open:shadow-card hover:shadow-card'
      )}
      open={defaultOpen}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 px-4 py-3.5',
          'text-sm font-medium text-neutral-900 marker:content-none',
          'transition-colors hover:bg-neutral-50/70'
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-[12px] font-semibold text-primary-700 ring-1 ring-inset ring-primary-100">
          {day.dayNumber}
        </span>
        <span className="min-w-0 flex-1">{day.title}</span>
        <Icon
          name="chevron-down"
          size={16}
          className="shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <p className="whitespace-pre-line border-t border-neutral-150 px-4 py-3.5 pl-14 text-sm leading-relaxed text-neutral-600">
        {day.description}
      </p>
    </details>
  );
}

/** Inclusions/exclusions column. Real icons rather than ✓/✕ glyphs, which render inconsistently. */
function ListColumn({ title, items, tone }) {
  const positive = tone === 'positive';

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
        <Icon
          name={positive ? 'check-circle' : 'x-circle'}
          size={14}
          className={positive ? 'text-success-600' : 'text-danger-600'}
        />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">None specified.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm text-neutral-700">
          {items.map((item, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i} className="flex items-start gap-2.5">
              <Icon
                name={positive ? 'check' : 'x'}
                size={14}
                className={cn('mt-0.5 shrink-0', positive ? 'text-success-600' : 'text-danger-500')}
              />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DestinationSection({ title, content }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900">{title}</h2>
      <MarkdownContent content={content} />
    </Card>
  );
}

function PackageDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    apiGet(`/api/packages/${id}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load package.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await apiDownload(`/api/packages/${id}/emv-quote.pdf`, {
        filename: `emv-quote-${slugify(data.package.title)}.pdf`,
      });
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not download the PDF.',
      });
    } finally {
      setDownloading(false);
    }
  };

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-3.5 w-48" />
          </div>
          <Skeleton className="h-44 w-full rounded-xl lg:w-[17rem]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-32 rounded-lg sm:h-40" />
          ))}
        </div>
      </div>
    );
  }

  const pkg = data.package;

  return (
    <div className="flex flex-col gap-8">
      {data.destinationArchived && (
        <Alert variant="warning">
          This package&apos;s destination has been archived — it&apos;s hidden from the marketplace but
          still viewable directly.
        </Alert>
      )}
      {pkg.archived && <Alert variant="warning">This package has been archived.</Alert>}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <PageHeader
            backTo="/packages"
            backLabel="Back to packages"
            eyebrow={pkg.destination?.name}
            title={pkg.title}
            subtitle={`${pkg.days} days / ${pkg.nights} nights`}
          />
          {pkg.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {pkg.tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Sticky on desktop: the price and the two actions are what this page exists for, and they
         * should stay reachable while scrolling a long itinerary. */}
        <Card
          className="lg:sticky lg:top-24 lg:w-[17rem] lg:shrink-0"
          bodyClassName="flex flex-col gap-4"
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              TravNexa cost
            </p>
            <p className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight text-neutral-900 tabular-nums">
              {formatCurrency(pkg.rawPrice)}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">
              Your wholesale cost — add your own markup when you generate the quote.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button as={Link} to={`/packages/${pkg.id}/quote`} size="lg" className="w-full">
              <Icon name="receipt" size={16} />
              Generate quote
            </Button>
            <Button variant="outline" loading={downloading} onClick={handleDownload} className="w-full">
              <Icon name="download" size={15} />
              TravNexa quote (PDF)
            </Button>
          </div>
        </Card>
      </div>

      {pkg.gallery?.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {pkg.gallery.map((src, i) => (
            <PackageImage
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              src={src}
              alt={`${pkg.title} ${i + 1}`}
              className="h-32 w-full rounded-xl ring-1 ring-neutral-900/5 sm:h-40"
            />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Itinerary</h2>
        <div className="flex flex-col gap-2">
          {pkg.packageDays.map((day) => (
            <ItineraryDay key={day.id} day={day} defaultOpen={day.dayNumber === 1} />
          ))}
        </div>
      </div>

      <DestinationSection title="About Destination" content={pkg.destination?.aboutDestination} />
      <DestinationSection title="Packages" content={pkg.destination?.packages} />
      <DestinationSection title="FAQs" content={pkg.destination?.faqs} />

      {pkg.packageHotels?.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-neutral-900">Hotels</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pkg.packageHotels.map((hotel) => (
              <Card key={hotel.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-neutral-900">{hotel.hotelName}</h3>
                  <Badge variant="info">{hotel.hotelCategory}</Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{hotel.hotelDescription}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card title="What's included">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <ListColumn title="Inclusions" items={splitTextBlock(pkg.inclusions)} tone="positive" />
          <ListColumn title="Exclusions" items={splitTextBlock(pkg.exclusions)} tone="negative" />
        </div>
      </Card>
    </div>
  );
}

export default PackageDetailPage;
