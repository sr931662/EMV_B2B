import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Select, Spinner } from '../../components/ui';
import PackageCard from '../../components/packages/PackageCard';
import { apiGet, ApiError } from '../../api/client';

const INITIAL_FILTERS = {
  destinationId: '',
  tag: '',
  minPrice: '',
  maxPrice: '',
  minDays: '',
  maxDays: '',
  search: '',
};

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.destinationId) params.set('destinationId', filters.destinationId);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.minPrice !== '') params.set('minPrice', filters.minPrice);
  if (filters.maxPrice !== '') params.set('maxPrice', filters.maxPrice);
  if (filters.minDays !== '') params.set('minDays', filters.minDays);
  if (filters.maxDays !== '') params.set('maxDays', filters.maxDays);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function PackageMarketplacePage() {
  const [destinations, setDestinations] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [packages, setPackages] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet('/api/destinations')
      .then((res) => setDestinations(res.destinations))
      .catch(() => {
        // Filter chrome only — a failed destinations fetch shouldn't block browsing packages.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);

      apiGet(`/api/packages${buildQuery(filters)}`)
        .then((res) => {
          if (cancelled) return;
          setPackages(res.packages);
          setCount(res.count);
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
  }, [filters]);

  const setField = (field) => (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => value !== INITIAL_FILTERS[key]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Browse Packages</h1>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            placeholder="Package title..."
            value={filters.search}
            onChange={setField('search')}
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
              value={filters.minPrice}
              onChange={setField('minPrice')}
            />
            <Input
              label="Max price"
              type="number"
              min="0"
              value={filters.maxPrice}
              onChange={setField('maxPrice')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Min days"
              type="number"
              min="1"
              value={filters.minDays}
              onChange={setField('minDays')}
            />
            <Input
              label="Max days"
              type="number"
              min="1"
              value={filters.maxDays}
              onChange={setField('maxDays')}
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => setFilters(INITIAL_FILTERS)} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {loading ? 'Loading…' : `${count} package${count === 1 ? '' : 's'} found`}
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : packages.length === 0 ? (
        <Card bodyClassName="text-center py-10">
          <p className="text-neutral-500">No packages match your filters.</p>
          {hasActiveFilters && (
            <Button variant="outline" className="mt-4" onClick={() => setFilters(INITIAL_FILTERS)}>
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      )}
    </div>
  );
}

export default PackageMarketplacePage;
