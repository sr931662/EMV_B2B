import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, Select, Spinner } from '../../components/ui';
import VisaSubNav from '../../components/admin/VisaSubNav';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

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
  const [status, setStatus] = useState('');
  const [requests, setRequests] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    const qs = status ? `?status=${status}` : '';
    apiGet(`/api/visa-requests${qs}`)
      .then((res) => {
        if (cancelled) return;
        setRequests(res.visaRequests);
        setCount(res.count);
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
  }, [status]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Visa Requests</h1>

      <VisaSubNav />

      <Card bodyClassName="max-w-xs">
        <Select label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <p className="text-sm text-neutral-500">
        {loading ? 'Loading…' : `${count} request${count === 1 ? '' : 's'}`}
      </p>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : requests.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">No visa requests match this filter.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Application</th>
                  <th className="px-5 py-3 font-medium">Agency</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Passengers</th>
                  <th className="px-5 py-3 font-medium">Selling Price</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/visa-requests/${r.id}`} className="font-medium text-primary-700">
                        {r.applicationNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{r.agencyName ?? '—'}</td>
                    <td className="px-5 py-3 text-neutral-700">{r.countryName}</td>
                    <td className="px-5 py-3 text-neutral-700">{r.passengerCount}</td>
                    <td className="px-5 py-3 text-neutral-700">{formatCurrency(r.sellingPrice)}</td>
                    <td className="px-5 py-3">
                      <Badge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(r.createdAt)}</td>
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

export default AdminVisaRequestsPage;
