import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, Select, Spinner } from '../../components/ui';
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Payment Verification Queue</h1>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:w-1/2">
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
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <p className="text-sm text-neutral-500">
        {loading ? 'Loading…' : `${count} payment${count === 1 ? '' : 's'}`}
      </p>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : payments.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">No payments match this filter.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Agency</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Expected (wholesale)</th>
                  <th className="px-5 py-3 font-medium">Transaction ID</th>
                  <th className="px-5 py-3 font-medium">Submitted</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.paymentId}
                    className={cn(
                      'cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50',
                      p.reconciliationMismatch && 'bg-warning-50 hover:bg-warning-100'
                    )}
                  >
                    <td className="px-5 py-3">
                      <Link to={`/admin/payments/${p.paymentId}`} className="block text-neutral-900">
                        {p.agencyName ?? '—'}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{p.type}</Badge>
                    </td>
                    <td className="px-5 py-3 text-neutral-700">
                      {p.type === 'PACKAGE' ? (
                        <>
                          {p.packageTitle}
                          {p.leadName && <span className="text-neutral-400"> &middot; {p.leadName}</span>}
                        </>
                      ) : (
                        <>
                          {p.applicationNumber}
                          {p.countryName && <span className="text-neutral-400"> &middot; {p.countryName}</span>}
                          {p.passengerCount != null && (
                            <span className="text-neutral-400">
                              {' '}
                              &middot; {p.passengerCount} passenger{p.passengerCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={p.reconciliationMismatch ? 'font-semibold text-warning-700' : 'text-neutral-900'}>
                        {formatCurrency(p.amount)}
                      </span>
                      {p.reconciliationMismatch && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
                          ⚠ Mismatch
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutral-700">
                      {p.amountDue != null ? (
                        <>
                          {formatCurrency(p.amountDue)}
                          {p.sellingPrice != null && (
                            <p className="text-xs text-neutral-400">
                              Customer pays {formatCurrency(p.sellingPrice)} (incl.{' '}
                              {formatCurrency(p.markupAmount)} markup)
                            </p>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{p.transactionId}</td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(p.submittedAt)}</td>
                    <td className="px-5 py-3">
                      <Badge status={p.type === 'PACKAGE' ? p.quoteStatus : p.visaRequestStatus} />
                    </td>
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

export default AdminPaymentsQueuePage;
