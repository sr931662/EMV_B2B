import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, Input, Select, Spinner } from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatDate } from '../../lib/format';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'unverified', label: 'Unverified' },
];

function agencyStatusBadge(agency) {
  if (agency.archived) return <Badge variant="danger">Suspended</Badge>;
  if (!agency.isVerified) return <Badge variant="warning">Unverified</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function buildQuery({ search, status }) {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function AgenciesListPage() {
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [agencies, setAgencies] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiGet(`/api/admin/agencies${buildQuery(filters)}`)
        .then((res) => {
          if (cancelled) return;
          setAgencies(res.agencies);
          setCount(res.count);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load agencies.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filters]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Agencies</h1>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:w-2/3">
          <Input
            label="Search"
            placeholder="Company name or email..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            options={STATUS_OPTIONS}
          />
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <p className="text-sm text-neutral-500">
        {loading ? 'Loading…' : `${count} agenc${count === 1 ? 'y' : 'ies'}`}
      </p>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : agencies.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">No agencies match your filters.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">City</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Quotes</th>
                  <th className="px-5 py-3 font-medium">Visa</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map((a) => (
                  <tr key={a.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/agencies/${a.id}`} className="font-medium text-primary-700">
                        {a.companyName ?? '—'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{a.ownerName ?? '—'}</td>
                    <td className="px-5 py-3 text-neutral-700">{a.businessEmail ?? a.email}</td>
                    <td className="px-5 py-3 text-neutral-700">{a.city ?? '—'}</td>
                    <td className="px-5 py-3">{agencyStatusBadge(a)}</td>
                    <td className="px-5 py-3 text-neutral-700">{a.quoteCount}</td>
                    <td className="px-5 py-3 text-neutral-700">{a.visaRequestCount}</td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default AgenciesListPage;
