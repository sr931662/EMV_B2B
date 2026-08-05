import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Pagination,
  PageHeader,
  Select,
  Skeleton,
  Table,
} from '../../components/ui';
import VisaSubNav from '../../components/admin/VisaSubNav';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'APPLICATION_SUBMITTED', label: 'Application Submitted' },
  { value: 'PAYMENT_SUBMITTED', label: 'Payment Submitted' },
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'PAYMENT_APPROVED', label: 'Payment Approved' },
  { value: 'VISA_PROCESSING_STARTED', label: 'Visa Processing Started' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Rejected' },
];

function AdminVisaRequestsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (status) params.set('status', status);

    apiGet(`/api/visa-requests?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setRequests(res.visaRequests);
        setTotal(res.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load visa requests.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, page]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Visa Requests"
        subtitle="Every application across all partner agencies, from submission to completion."
      />

      <VisaSubNav />

      <Card bodyClassName="flex flex-wrap items-end gap-4 p-4">
        <Select
          label="Filter by status"
          className="w-full sm:w-72"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
        />
        {!loading && (
          <p className="pb-2.5 text-[13px] text-neutral-500">
            <span className="font-semibold text-neutral-900 tabular-nums">{total}</span> request
            {total === 1 ? '' : 's'}
          </p>
        )}
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={6} cols={6} />
        </Card>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="plane"
          title="No visa requests match this filter"
          description={
            status
              ? 'Try a different status, or clear the filter to see every application.'
              : 'No agency has submitted a visa application yet.'
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="54rem">
            <Table.Head>
              <Table.HeadCell>Application</Table.HeadCell>
              <Table.HeadCell>Agency</Table.HeadCell>
              <Table.HeadCell>Country</Table.HeadCell>
              <Table.HeadCell align="right">Passengers</Table.HeadCell>
              <Table.HeadCell align="right">Selling price</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">Created</Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {requests.map((r) => (
                <Table.Row
                  key={r.id}
                  interactive
                  onClick={() => navigate(`/admin/visa-requests/${r.id}`)}
                >
                  <Table.Cell strong>
                    <Link
                      to={`/admin/visa-requests/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-[12px] text-primary-700 hover:underline"
                    >
                      {r.applicationNumber}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{r.agencyName ?? '—'}</Table.Cell>
                  <Table.Cell>{r.countryName}</Table.Cell>
                  <Table.Cell align="right">{r.passengerCount}</Table.Cell>
                  <Table.Cell align="right" strong>
                    {formatCurrency(r.sellingPrice)}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge status={r.status} />
                  </Table.Cell>
                  <Table.Cell align="right" muted>
                    {formatDate(r.createdAt)}
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

export default AdminVisaRequestsPage;
