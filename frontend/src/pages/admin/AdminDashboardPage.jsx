import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  Skeleton,
  StatCard,
  StatusChips,
  Table,
} from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';
import { cn } from '../../lib/cn';

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
      <PageHeader
        eyebrow="Operations"
        title="Admin Dashboard"
        subtitle="Platform-wide agencies, inventory, quotes and payment throughput."
        actions={
          // The date range only scopes payment totals, so it's labelled inline rather than
          // presented as a global filter for the whole page.
          <div className="surface flex flex-wrap items-end gap-3 rounded-xl p-3">
            <Input
              label="From"
              type="date"
              className="h-9"
              value={range.from}
              onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
            />
            <Input
              label="To"
              type="date"
              className="h-9"
              value={range.to}
              onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
            />
            <span className="flex items-center gap-1.5 pb-2 text-[11px] text-neutral-400">
              <Icon name="info" size={13} />
              Payment totals only
            </span>
          </div>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {loading || !data ? (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton.Stat key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton.Stat key={i} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Agencies"
              value={data.agencies.total}
              hint={`${data.agencies.active} active · ${data.agencies.suspended} suspended · ${data.agencies.unverified} unverified`}
              icon="building"
              tone="primary"
            />
            <StatCard
              label="Active packages"
              value={data.packages.active}
              icon="package"
              tone="info"
            />
            <StatCard label="Quotes" value={data.quotes.total} icon="receipt" tone="neutral">
              <StatusChips byStatus={data.quotes.byStatus} />
            </StatCard>
            <StatCard label="Visa requests" value={data.visaRequests.total} icon="plane" tone="accent">
              <StatusChips byStatus={data.visaRequests.byStatus} />
            </StatCard>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">Payments</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total submitted"
                value={data.payments.totalSubmitted}
                icon="card"
                tone="neutral"
              />

              {/* The verification queue is the one thing on this page an admin must act on, so it
               * is the only tile that is a link and the only one allowed to carry a full colour
               * wash. Everything else stays neutral so this reads as the call to action. */}
              <Link
                to="/admin/payments"
                className={cn(
                  'group relative flex flex-col gap-1 overflow-hidden rounded-xl p-4',
                  'bg-warning-50 ring-1 ring-inset ring-warning-200',
                  'shadow-card transition-shadow duration-200 hover:shadow-md',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-warning-700">
                    Pending verification
                  </span>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/70 text-warning-700 ring-1 ring-inset ring-warning-200">
                    <Icon name="clock" size={15} />
                  </span>
                </div>
                <span className="text-[26px] font-semibold leading-tight tracking-tight text-warning-700 tabular-nums">
                  {data.payments.pendingVerification}
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-warning-700">
                  Go to queue
                  <Icon
                    name="arrow-right"
                    size={14}
                    className="transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </span>
              </Link>

              <StatCard
                label="Approved"
                value={data.payments.approved.count}
                hint={formatCurrency(data.payments.approved.revenue)}
                icon="check-circle"
                tone="success"
              />
              <StatCard
                label="Rejected"
                value={data.payments.rejected}
                icon="x-circle"
                tone={data.payments.rejected > 0 ? 'danger' : 'neutral'}
              />
            </div>
          </div>

          <Card
            title="Recent activity"
            subtitle="Latest payment submissions across all agencies"
            icon={<Icon name="clock" size={16} />}
            bodyClassName={data.recentActivity.length === 0 ? 'p-5' : 'p-0'}
          >
            {data.recentActivity.length === 0 ? (
              <EmptyState
                compact
                icon="card"
                title="No payment activity yet"
                description="Submissions from partner agencies will appear here as they arrive."
              />
            ) : (
              <Table minWidth="40rem">
                <Table.Head>
                  <Table.HeadCell>Agency</Table.HeadCell>
                  <Table.HeadCell>Type</Table.HeadCell>
                  <Table.HeadCell align="right">Amount</Table.HeadCell>
                  <Table.HeadCell>Status</Table.HeadCell>
                  <Table.HeadCell align="right">Date</Table.HeadCell>
                </Table.Head>
                <Table.Body>
                  {data.recentActivity.map((item) => (
                    <Table.Row key={item.paymentId}>
                      <Table.Cell strong>{item.agencyName ?? '—'}</Table.Cell>
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
        </>
      )}
    </div>
  );
}

export default AdminDashboardPage;
