import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import ConfirmModal from '../../components/admin/ConfirmModal';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

function statusBadge(agency) {
  if (agency.archived) return <Badge variant="danger">Suspended</Badge>;
  if (!agency.isVerified) return <Badge variant="warning">Unverified</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function AgencyDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();

  const [agency, setAgency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // 'suspend' | 'activate'

  const loadAgency = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/admin/agencies/${id}`)
      .then((res) => setAgency(res.agency))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load agency.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAgency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSuspend = async () => {
    await apiPost(`/api/admin/agencies/${id}/suspend`);
    setConfirmAction(null);
    await loadAgency();
    showToast({ variant: 'success', message: 'Agency suspended — sessions revoked.' });
  };

  const handleActivate = async () => {
    await apiPost(`/api/admin/agencies/${id}/activate`);
    setConfirmAction(null);
    await loadAgency();
    showToast({ variant: 'success', message: 'Agency activated.' });
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

  const p = agency.profile;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/agencies" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to agencies
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">{p?.companyName ?? agency.email}</h1>
          <p className="mt-1 text-sm text-neutral-500">{agency.email}</p>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge(agency)}
          {agency.archived ? (
            <Button onClick={() => setConfirmAction('activate')}>Activate</Button>
          ) : (
            <Button variant="danger" onClick={() => setConfirmAction('suspend')}>
              Suspend
            </Button>
          )}
        </div>
      </div>

      <Card title="Profile">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Owner</dt>
            <dd className="text-neutral-900">{p?.ownerName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Business email</dt>
            <dd className="text-neutral-900">{p?.businessEmail ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Mobile</dt>
            <dd className="text-neutral-900">{p?.mobile ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-neutral-500">Address</dt>
            <dd className="text-neutral-900">
              {[p?.officeAddress, p?.city, p?.state, p?.country, p?.pincode].filter(Boolean).join(', ') ||
                '—'}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Website</dt>
            <dd className="text-neutral-900">{p?.website ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">GST number</dt>
            <dd className="text-neutral-900">{p?.gstNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">PAN number</dt>
            <dd className="text-neutral-900">{p?.panNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Joined</dt>
            <dd className="text-neutral-900">{formatDate(agency.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      <Card title={`Quotes (${agency.quotesTotal})`} bodyClassName="p-0">
        {agency.quotes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">No quotes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Package</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Selling price</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {agency.quotes.map((q) => (
                  <tr key={q.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">
                      {q.packageTitle}
                      {q.archived && <span className="ml-2 text-xs text-neutral-400">(archived)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={q.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{formatCurrency(q.sellingPrice)}</td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(q.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {agency.quotesTotal > agency.quotes.length && (
          <p className="border-t border-neutral-100 px-5 py-2.5 text-[12.5px] text-neutral-500">
            Showing the latest {agency.quotes.length} of {agency.quotesTotal}.
          </p>
        )}
      </Card>

      <Card title={`Visa requests (${agency.visaRequestsTotal})`} bodyClassName="p-0">
        {agency.visaRequests.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">No visa requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Application</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Passengers</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {agency.visaRequests.map((v) => (
                  <tr key={v.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">
                      {v.applicationNumber}
                      {v.archived && <span className="ml-2 text-xs text-neutral-400">(archived)</span>}
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{v.countryName}</td>
                    <td className="px-5 py-3 text-neutral-700">{v.passengerCount}</td>
                    <td className="px-5 py-3">
                      <Badge status={v.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {agency.visaRequestsTotal > agency.visaRequests.length && (
          <p className="border-t border-neutral-100 px-5 py-2.5 text-[12.5px] text-neutral-500">
            Showing the latest {agency.visaRequests.length} of {agency.visaRequestsTotal}.
          </p>
        )}
      </Card>

      <Card title={`Payment history (${agency.paymentsTotal})`} bodyClassName="p-0">
        {agency.payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {agency.payments.map((pay) => (
                  <tr key={pay.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">{pay.subject ?? '—'}</td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{pay.type}</Badge>
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{formatCurrency(pay.amount)}</td>
                    <td className="px-5 py-3">
                      <Badge status={pay.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(pay.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {agency.paymentsTotal > agency.payments.length && (
          <p className="border-t border-neutral-100 px-5 py-2.5 text-[12.5px] text-neutral-500">
            Showing the latest {agency.payments.length} of {agency.paymentsTotal}.
          </p>
        )}
      </Card>

      <ConfirmModal
        open={confirmAction === 'suspend'}
        onClose={() => setConfirmAction(null)}
        title="Suspend agency"
        description="This immediately logs them out and blocks access to their account. They will need to be reactivated before they can log in again."
        confirmLabel="Suspend"
        confirmVariant="danger"
        onConfirm={handleSuspend}
      />

      <ConfirmModal
        open={confirmAction === 'activate'}
        onClose={() => setConfirmAction(null)}
        title="Activate agency"
        description="This restores their access. They will need to log in again."
        confirmLabel="Activate"
        onConfirm={handleActivate}
      />
    </div>
  );
}

export default AgencyDetailPage;
