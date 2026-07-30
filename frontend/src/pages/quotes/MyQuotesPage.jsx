import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Select, Spinner } from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'QUOTE_GENERATED', label: 'Quote Generated' },
  { value: 'CUSTOMER_APPROVED', label: 'Customer Approved' },
  { value: 'PAYMENT_SUBMITTED', label: 'Payment Submitted' },
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'BOOKING_CONFIRMED', label: 'Booking Confirmed' },
  { value: 'ORDER_COMPLETED', label: 'Order Completed' },
  { value: 'REJECTED', label: 'Rejected' },
];

function MyQuotesPage() {
  const [status, setStatus] = useState('');
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    const qs = status ? `?status=${status}` : '';
    apiGet(`/api/quotes${qs}`)
      .then((res) => {
        if (!cancelled) setQuotes(res.quotes);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load quotes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">My Quotes</h1>
        <Link to="/packages">
          <Button variant="outline">Browse Packages</Button>
        </Link>
      </div>

      <Card bodyClassName="max-w-xs">
        <Select
          label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
        />
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : quotes.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">
            {status ? 'No quotes match this filter.' : 'No quotes yet — browse packages to create your first.'}
          </p>
          {!status && (
            <Link to="/packages" className="mt-4 inline-block">
              <Button>Browse Packages</Button>
            </Link>
          )}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Package</th>
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">Customer price</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">{q.package?.title}</td>
                    <td className="px-5 py-3 text-neutral-900">{q.leadName}</td>
                    <td className="px-5 py-3 text-neutral-900">{formatCurrency(q.sellingPrice)}</td>
                    <td className="px-5 py-3">
                      <Badge status={q.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(q.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/quotes/${q.id}`}
                        className="font-medium text-primary-600 hover:text-primary-700"
                      >
                        View
                      </Link>
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

export default MyQuotesPage;
