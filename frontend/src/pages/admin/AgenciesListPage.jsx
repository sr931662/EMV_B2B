import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Icon,
  Input,
  Pagination,
  PageHeader,
  Select,
  Skeleton,
  Table,
} from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatDate } from '../../lib/format';

const PAGE_SIZE = 50;

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

function buildQuery({ search, status }, page) {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String((page - 1) * PAGE_SIZE));
  return `?${params.toString()}`;
}

function AgenciesListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [agencies, setAgencies] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiGet(`/api/admin/agencies${buildQuery(filters, page)}`)
        .then((res) => {
          if (cancelled) return;
          setAgencies(res.agencies);
          setTotal(res.total);
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
  }, [filters, page]);

  const hasFilters = filters.search.trim() !== '' || filters.status !== '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Network"
        title="Agencies"
        subtitle="Every registered partner agency, their verification state and booking volume."
      />

      <Card bodyClassName="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:max-w-2xl">
        <Input
          label="Search"
          placeholder="Company name or email…"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          leading={<Icon name="search" size={15} />}
        />
        <Select
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          options={STATUS_OPTIONS}
        />
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <p className="text-[13px] text-neutral-500">
        {loading ? (
          'Loading…'
        ) : (
          <>
            <span className="font-semibold text-neutral-900 tabular-nums">{total}</span> agenc
            {total === 1 ? 'y' : 'ies'}
          </>
        )}
      </p>

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={6} cols={6} />
        </Card>
      ) : agencies.length === 0 ? (
        <EmptyState
          icon="building"
          title="No agencies match your filters"
          description={
            hasFilters
              ? 'Try a different search term or status.'
              : 'No agencies have registered yet. They appear here as soon as they sign up.'
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="58rem">
            <Table.Head>
              <Table.HeadCell>Company</Table.HeadCell>
              <Table.HeadCell>Owner</Table.HeadCell>
              <Table.HeadCell>Email</Table.HeadCell>
              <Table.HeadCell>City</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">Quotes</Table.HeadCell>
              <Table.HeadCell align="right">Visa</Table.HeadCell>
              <Table.HeadCell align="right">Joined</Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {agencies.map((a) => (
                <Table.Row key={a.id} interactive onClick={() => navigate(`/admin/agencies/${a.id}`)}>
                  <Table.Cell strong>
                    <Link
                      to={`/admin/agencies/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-700 hover:underline"
                    >
                      {a.companyName ?? '—'}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{a.ownerName ?? '—'}</Table.Cell>
                  <Table.Cell muted>{a.businessEmail ?? a.email}</Table.Cell>
                  <Table.Cell>{a.city ?? '—'}</Table.Cell>
                  <Table.Cell>{agencyStatusBadge(a)}</Table.Cell>
                  <Table.Cell align="right">{a.quoteCount}</Table.Cell>
                  <Table.Cell align="right">{a.visaRequestCount}</Table.Cell>
                  <Table.Cell align="right" muted>
                    {formatDate(a.createdAt)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
        </Card>
      )}
    </div>
  );
}

export default AgenciesListPage;
