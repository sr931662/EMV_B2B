import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Pagination,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import PackageCard from '../../components/packages/PackageCard';
import { apiGet, ApiError } from '../../api/client';
import { PICKER_FULL_LIST_LIMIT } from '../../lib/constants';

const PAGE_SIZE = 24; // a round number of grid cells at 4-up, 3-up and 2-up breakpoints alike

const INITIAL_FILTERS = {
  destinationId: '',
  tag: '',
  minPrice: '',
  maxPrice: '',
  minDays: '',
  maxDays: '',
  search: '',
};

function buildQuery(filters, page) {
  const params = new URLSearchParams();
  if (filters.destinationId) params.set('destinationId', filters.destinationId);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.minPrice !== '') params.set('minPrice', filters.minPrice);
  if (filters.maxPrice !== '') params.set('maxPrice', filters.maxPrice);
  if (filters.minDays !== '') params.set('minDays', filters.minDays);
  if (filters.maxDays !== '') params.set('maxDays', filters.maxDays);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String((page - 1) * PAGE_SIZE));
  return `?${params.toString()}`;
}

function PackageMarketplacePage() {
  const [destinations, setDestinations] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [packages, setPackages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Filter dropdown, not a browse list — needs every destination, so it asks for the app's
    // practical ceiling rather than a paged default.
    apiGet(`/api/destinations?limit=${PICKER_FULL_LIST_LIMIT}`)
      .then((res) => setDestinations(res.destinations))
      .catch(() => {
        // Filter chrome only — a failed destinations fetch shouldn't block browsing packages.
      });
  }, []);

  // A filter change means the previous page number may no longer point at anything relevant —
  // reset to the first page rather than re-fetching page 6 of a now-three-page result set.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);

      apiGet(`/api/packages${buildQuery(filters, page)}`)
        .then((res) => {
          if (cancelled) return;
          setPackages(res.packages);
          setTotal(res.total);
          setAllTags((prev) => {
            const union = new Set(prev);
            res.packages.forEach((p) => p.tags?.forEach((t) => union.add(t)));
            return Array.from(union).sort();
          });
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load packages.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filters, page]);

  const setField = (field) => (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => value !== INITIAL_FILTERS[key]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Marketplace"
        title="Browse Packages"
        subtitle="Wholesale-priced inventory ready to quote under your own brand."
      />

      <Card
        title="Filters"
        icon={<Icon name="filter" size={15} />}
        actions={
          hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(INITIAL_FILTERS)}>
              <Icon name="x" size={14} />
              Clear all
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            placeholder="Package title…"
            value={filters.search}
            onChange={setField('search')}
            leading={<Icon name="search" size={15} />}
          />
          <Select
            label="Destination"
            value={filters.destinationId}
            onChange={setField('destinationId')}
            options={[
              { value: '', label: 'All destinations' },
              ...destinations.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
          <Select
            label="Tag"
            value={filters.tag}
            onChange={setField('tag')}
            options={[{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t, label: t }))]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Min price"
              type="number"
              min="0"
              placeholder="0"
              value={filters.minPrice}
              onChange={setField('minPrice')}
            />
            <Input
              label="Max price"
              type="number"
              min="0"
              placeholder="Any"
              value={filters.maxPrice}
              onChange={setField('maxPrice')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Min days"
              type="number"
              min="1"
              placeholder="1"
              value={filters.minDays}
              onChange={setField('minDays')}
            />
            <Input
              label="Max days"
              type="number"
              min="1"
              placeholder="Any"
              value={filters.maxDays}
              onChange={setField('maxDays')}
            />
          </div>
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-neutral-500">
          {loading ? (
            'Searching…'
          ) : (
            <>
              <span className="font-semibold text-neutral-900 tabular-nums">{total}</span>{' '}
              package{total === 1 ? '' : 's'} found
            </>
          )}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton.Card key={i} />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <EmptyState
          icon="search"
          title="No packages match your filters"
          description={
            hasActiveFilters
              ? 'Try widening your price or duration range, or clearing a filter.'
              : 'No packages have been published yet. Check back shortly.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" onClick={() => setFilters(INITIAL_FILTERS)}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
          <Card bodyClassName="p-0">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
          </Card>
        </>
      )}
    </div>
  );
}

export default PackageMarketplacePage;
