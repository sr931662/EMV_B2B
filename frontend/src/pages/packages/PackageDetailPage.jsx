import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import PackageImage from '../../components/packages/PackageImage';
import { apiGet, apiDownload, ApiError } from '../../api/client';
import { formatCurrency, slugify, splitTextBlock } from '../../lib/format';

function ItineraryDay({ day, defaultOpen }) {
  return (
    <details
      className="group rounded-lg border border-neutral-200 open:border-primary-200"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-900 marker:content-none">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
          {day.dayNumber}
        </span>
        {day.title}
      </summary>
      <p className="whitespace-pre-line px-4 pb-4 pl-11 text-sm text-neutral-600">{day.description}</p>
    </details>
  );
}

function ListColumn({ title, items, tone }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-neutral-900">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">None specified.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm text-neutral-700">
          {items.map((item, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i} className="flex items-start gap-2">
              <span className={tone === 'positive' ? 'text-success-600' : 'text-danger-600'}>
                {tone === 'positive' ? '✓' : '✕'}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  const pkg = data.package;

  return (
    <div className="flex flex-col gap-8">
      <Link to="/packages" className="text-sm font-medium text-primary-600 hover:text-primary-700">
        &larr; Back to packages
      </Link>

      {data.destinationArchived && (
        <Alert variant="warning">
          This package&apos;s destination has been archived — it&apos;s hidden from the marketplace but
          still viewable directly.
        </Alert>
      )}
      {pkg.archived && <Alert variant="warning">This package has been archived.</Alert>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-neutral-900">{pkg.title}</h1>
          <p className="text-neutral-500">
            {pkg.destination?.name} &middot; {pkg.days} days / {pkg.nights} nights
          </p>
          {pkg.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pkg.tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Card bodyClassName="flex flex-col gap-3 min-w-[220px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">TravNexa Cost</p>
            <p className="text-2xl font-semibold text-neutral-900">{formatCurrency(pkg.rawPrice)}</p>
            <p className="text-xs text-neutral-400">This is your cost — set your own markup in the quote.</p>
          </div>
          <Button as={Link} to={`/packages/${pkg.id}/quote`} className="w-full">
            Generate Quote
          </Button>
          <Button variant="outline" loading={downloading} onClick={handleDownload} className="w-full">
            Download TravNexa Quote (PDF)
          </Button>
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
              className="h-32 w-full rounded-lg sm:h-40"
            />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Itinerary</h2>
        <div className="flex flex-col gap-2">
          {pkg.packageDays.map((day) => (
            <ItineraryDay key={day.id} day={day} defaultOpen={day.dayNumber === 1} />
          ))}
        </div>
      </div>

      {pkg.packageHotels?.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">Hotels</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pkg.packageHotels.map((hotel) => (
              <Card key={hotel.id}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-neutral-900">{hotel.hotelName}</h3>
                  <Badge variant="info">{hotel.hotelCategory}</Badge>
                </div>
                <p className="mt-2 text-sm text-neutral-600">{hotel.hotelDescription}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ListColumn title="Inclusions" items={splitTextBlock(pkg.inclusions)} tone="positive" />
          <ListColumn title="Exclusions" items={splitTextBlock(pkg.exclusions)} tone="negative" />
        </div>
      </Card>
    </div>
  );
}

export default PackageDetailPage;
