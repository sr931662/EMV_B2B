import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, Input, Spinner, StatCard, StatusChips } from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

function buildQuery({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function AdminDashboardPage() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    apiGet(`/api/admin/reports/summary${buildQuery(range)}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Admin Dashboard</h1>
        <Card bodyClassName="flex flex-wrap items-end gap-3 py-3">
          <Input
            label="From"
            type="date"
            value={range.from}
            onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
          />
          <Input
            label="To"
            type="date"
            value={range.to}
            onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
          />
          <span className="pb-2 text-xs text-neutral-400">Applies to payment totals only</span>
        </Card>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading || !data ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Agencies"
              value={data.agencies.total}
              hint={`${data.agencies.active} active · ${data.agencies.suspended} suspended · ${data.agencies.unverified} unverified`}
            />
            <StatCard label="Active packages" value={data.packages.active} />
            <StatCard label="Quotes" value={data.quotes.total}>
              <StatusChips byStatus={data.quotes.byStatus} />
            </StatCard>
            <StatCard label="Visa requests" value={data.visaRequests.total}>
              <StatusChips byStatus={data.visaRequests.byStatus} />
            </StatCard>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-neutral-900">Payments</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total submitted" value={data.payments.totalSubmitted} />

              <Link to="/admin/payments" className="block">
                <Card className="h-full border-warning-300 bg-warning-50 transition-shadow hover:shadow-md">
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning-700">
                    Pending Verification
                  </p>
                  <p className="mt-1 text-3xl font-bold text-warning-700">
                    {data.payments.pendingVerification}
                  </p>
                  <p className="mt-1 text-sm text-warning-700 underline">Go to queue &rarr;</p>
                </Card>
              </Link>

              <StatCard
                label="Approved"
                value={data.payments.approved.count}
                hint={formatCurrency(data.payments.approved.revenue)}
              />
              <StatCard label="Rejected" value={data.payments.rejected} />
            </div>
          </div>

          <Card title="Recent activity">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-neutral-500">No payment activity yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="pb-2 pr-4 font-medium">Agency</th>
                      <th className="pb-2 pr-4 font-medium">Type</th>
                      <th className="pb-2 pr-4 font-medium">Amount</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentActivity.map((item) => (
                      <tr key={item.paymentId} className="border-b border-neutral-100 last:border-0">
                        <td className="py-2 pr-4 text-neutral-900">{item.agencyName ?? '—'}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="neutral">{item.type}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-neutral-900">{formatCurrency(item.amount)}</td>
                        <td className="py-2 pr-4">
                          <Badge status={item.status} />
                        </td>
                        <td className="py-2 text-neutral-500">{formatDate(item.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default AdminDashboardPage;
