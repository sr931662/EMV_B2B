import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, StatCard, StatusChips } from '../../components/ui';
import PackageCard from '../../components/packages/PackageCard';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

function PartnerDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    apiGet('/api/dashboard')
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
  }, []);

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Link to="/packages">
            <Button variant="primary">Browse Packages</Button>
          </Link>
          <Link to="/visa">
            <Button variant="outline">Visa Services</Button>
          </Link>
          <Link to="/quotes">
            <Button variant="outline">My Quotes</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Quotes" value={data.quotes.total}>
          {data.quotes.total === 0 ? (
            <p className="text-sm text-neutral-500">No quotes yet — browse packages to create your first.</p>
          ) : (
            <StatusChips byStatus={data.quotes.byStatus} />
          )}
        </StatCard>

        <StatCard label="Visa requests" value={data.visaRequests.total}>
          {data.visaRequests.total === 0 ? (
            <p className="text-sm text-neutral-500">No visa requests yet.</p>
          ) : (
            <StatusChips byStatus={data.visaRequests.byStatus} />
          )}
        </StatCard>

        <StatCard label="Pending payments" value={data.pendingPayments} hint="Awaiting TravNexa verification" />

        <StatCard label="Approved orders" value={data.approvedOrders} hint="Confirmed bookings" />

        <StatCard label="Unread notifications" value={data.unreadNotifications} />
      </div>

      <Card title="Recent activity">
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-neutral-500">No recent activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="pb-2 pr-4 font-medium">Subject</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((item) => (
                  <tr key={item.paymentId} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2 pr-4 text-neutral-900">{item.subject ?? '—'}</td>
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

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Latest packages</h2>
          <Link to="/packages" className="text-sm font-medium text-primary-600 hover:text-primary-700">
            View all
          </Link>
        </div>
        {data.latestPackages.length === 0 ? (
          <p className="text-sm text-neutral-500">No packages available yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {data.latestPackages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PartnerDashboardPage;
