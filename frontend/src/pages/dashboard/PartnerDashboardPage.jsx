import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Skeleton,
  StatCard,
  StatusChips,
  Table,
} from '../../components/ui';
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

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  // Skeletons shaped like the real tiles, so nothing jumps when the payload lands.
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Dashboard" subtitle="Loading your latest activity…" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton.Stat key={i} />
          ))}
        </div>
        <Card title="Recent activity">
          <Skeleton.Rows rows={4} cols={5} />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Partner workspace"
        title="Dashboard"
        subtitle="Your quotes, visa requests and payment status at a glance."
        actions={
          <>
            <Button as={Link} to="/packages">
              <Icon name="package" size={16} />
              Browse packages
            </Button>
            <Button as={Link} to="/visa" variant="outline">
              <Icon name="plane" size={16} />
              Visa services
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Quotes" value={data.quotes.total} icon="receipt" tone="primary">
          {data.quotes.total === 0 ? (
            <p className="text-[13px] leading-snug text-neutral-500">
              None yet — browse packages to create your first.
            </p>
          ) : (
            <StatusChips byStatus={data.quotes.byStatus} />
          )}
        </StatCard>

        <StatCard label="Visa requests" value={data.visaRequests.total} icon="plane" tone="info">
          {data.visaRequests.total === 0 ? (
            <p className="text-[13px] leading-snug text-neutral-500">No visa requests yet.</p>
          ) : (
            <StatusChips byStatus={data.visaRequests.byStatus} />
          )}
        </StatCard>

        <StatCard
          label="Pending payments"
          value={data.pendingPayments}
          hint="Awaiting TravNexa verification"
          icon="clock"
          tone={data.pendingPayments > 0 ? 'warning' : 'neutral'}
        />

        <StatCard
          label="Approved orders"
          value={data.approvedOrders}
          hint="Confirmed bookings"
          icon="check-circle"
          tone="success"
        />

        <StatCard
          label="Unread alerts"
          value={data.unreadNotifications}
          icon="bell"
          tone={data.unreadNotifications > 0 ? 'accent' : 'neutral'}
        />
      </div>

      <Card
        title="Recent activity"
        subtitle="Your latest payment submissions"
        icon={<Icon name="clock" size={16} />}
        bodyClassName={data.recentActivity.length === 0 ? 'p-5' : 'p-0'}
      >
        {data.recentActivity.length === 0 ? (
          <EmptyState
            compact
            icon="receipt"
            title="No activity yet"
            description="Once you submit a payment for a quote or visa request, it will show up here."
          />
        ) : (
          <Table minWidth="40rem">
            <Table.Head>
              <Table.HeadCell>Subject</Table.HeadCell>
              <Table.HeadCell>Type</Table.HeadCell>
              <Table.HeadCell align="right">Amount</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">Date</Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {data.recentActivity.map((item) => (
                <Table.Row key={item.paymentId}>
                  <Table.Cell strong>{item.subject ?? '—'}</Table.Cell>
                  <Table.Cell>
                    <Badge variant="neutral">{item.type}</Badge>
                  </Table.Cell>
                  <Table.Cell align="right" strong>
                    {formatCurrency(item.amount)}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge status={item.status} />
                  </Table.Cell>
                  <Table.Cell align="right" muted>
                    {formatDate(item.date)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>

      <div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Latest packages</h2>
            <p className="mt-0.5 text-[13px] text-neutral-500">Fresh inventory ready to quote.</p>
          </div>
          <Link
            to="/packages"
            className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            View all
            <Icon
              name="arrow-right"
              size={14}
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        {data.latestPackages.length === 0 ? (
          <EmptyState
            icon="package"
            title="No packages available yet"
            description="TravNexa hasn't published any packages for your account. Check back shortly."
          />
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
