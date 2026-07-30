import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Select,
  Skeleton,
  Table,
} from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';
import { cn } from '../../lib/cn';

const STATUS_OPTIONS = [
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'INFO_REQUESTED', label: 'Info Requested' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'PACKAGE', label: 'Package' },
  { value: 'VISA', label: 'Visa' },
];

function buildQuery({ status, type }) {
  const params = new URLSearchParams();
  params.set('status', status);
  if (type) params.set('type', type);
  return `?${params.toString()}`;
}

function AdminPaymentsQueuePage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: 'PENDING_VERIFICATION', type: '' });
  const [payments, setPayments] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    apiGet(`/api/admin/payments${buildQuery(filters)}`)
      .then((res) => {
        if (cancelled) return;
        setPayments(res.payments);
        setCount(res.count);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load payments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  const mismatchCount = payments.filter((p) => p.reconciliationMismatch).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Payment Verification Queue"
        subtitle="Review submitted proofs against the wholesale amount owed, then approve or reject."
      />

      <Card bodyClassName="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:max-w-lg">
        <Select
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          options={STATUS_OPTIONS}
        />
        <Select
          label="Type"
          value={filters.type}
          onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
          options={TYPE_OPTIONS}
        />
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Mismatches are the reason this queue exists, so surface the count above the table rather
       * than leaving an admin to spot the highlighted rows by eye. */}
      {!loading && mismatchCount > 0 && (
        <Alert variant="warning" title={`${mismatchCount} amount mismatch${mismatchCount === 1 ? '' : 'es'}`}>
          The highlighted rows were paid for an amount that differs from the wholesale total owed to
          TravNexa. Open each one to compare before approving.
        </Alert>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-neutral-500">
          {loading ? (
            'Loading…'
          ) : (
            <>
              <span className="font-semibold text-neutral-900 tabular-nums">{count}</span> payment
              {count === 1 ? '' : 's'}
            </>
          )}
        </p>
      </div>

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={6} cols={6} />
        </Card>
      ) : payments.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Queue is clear"
          description="No payments match this filter. Nothing is waiting on you right now."
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="66rem">
            <Table.Head>
              <Table.HeadCell>Agency</Table.HeadCell>
              <Table.HeadCell>Type</Table.HeadCell>
              <Table.HeadCell>Subject</Table.HeadCell>
              <Table.HeadCell align="right">Amount paid</Table.HeadCell>
              <Table.HeadCell align="right">Expected (wholesale)</Table.HeadCell>
              <Table.HeadCell>Transaction ID</Table.HeadCell>
              <Table.HeadCell align="right">Submitted</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {payments.map((p) => (
                <Table.Row
                  key={p.paymentId}
                  interactive
                  // The row was already styled as clickable but only the agency cell navigated.
                  // Now the whole row does, while the cell keeps a real <a> so keyboard users and
                  // open-in-new-tab still work.
                  onClick={() => navigate(`/admin/payments/${p.paymentId}`)}
                  className={cn(
                    p.reconciliationMismatch && 'bg-warning-50 hover:bg-warning-100/70'
                  )}
                >
                  <Table.Cell strong>
                    <Link
                      to={`/admin/payments/${p.paymentId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-primary-700 hover:underline"
                    >
                      {p.agencyName ?? '—'}
                    </Link>
                  </Table.Cell>

                  <Table.Cell>
                    <Badge variant="neutral">{p.type}</Badge>
                  </Table.Cell>

                  <Table.Cell>
                    {p.type === 'PACKAGE' ? (
                      <>
                        <span className="font-medium text-neutral-800">{p.packageTitle}</span>
                        {p.leadName && (
                          <span className="block text-[12px] text-neutral-400">{p.leadName}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-neutral-800">{p.applicationNumber}</span>
                        <span className="block text-[12px] text-neutral-400">
                          {[
                            p.countryName,
                            p.passengerCount != null
                              ? `${p.passengerCount} passenger${p.passengerCount === 1 ? '' : 's'}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </>
                    )}
                  </Table.Cell>

                  <Table.Cell align="right">
                    <span
                      className={cn(
                        'font-semibold',
                        p.reconciliationMismatch ? 'text-warning-700' : 'text-neutral-900'
                      )}
                    >
                      {formatCurrency(p.amount)}
                    </span>
                    {p.reconciliationMismatch && (
                      <span className="mt-1 flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning-700">
                        <Icon name="alert-triangle" size={12} />
                        Mismatch
                      </span>
                    )}
                  </Table.Cell>

                  <Table.Cell align="right">
                    {p.amountDue != null ? (
                      <>
                        <span className="font-medium text-neutral-800">
                          {formatCurrency(p.amountDue)}
                        </span>
                        {p.sellingPrice != null && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-neutral-400">
                            Customer pays {formatCurrency(p.sellingPrice)}
                            <br />
                            incl. {formatCurrency(p.markupAmount)} markup
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </Table.Cell>

                  <Table.Cell>
                    <span className="font-mono text-[12px] text-neutral-600">{p.transactionId}</span>
                  </Table.Cell>

                  <Table.Cell align="right" muted>
                    {formatDate(p.submittedAt)}
                  </Table.Cell>

                  <Table.Cell>
                    <Badge status={p.type === 'PACKAGE' ? p.quoteStatus : p.visaRequestStatus} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default AdminPaymentsQueuePage;
