import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Pagination,
  PageHeader,
  Select,
  Skeleton,
  Table,
} from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

const PAGE_SIZE = 50;

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

    apiGet(`/api/quotes?${params.toString()}`)
      .then((res) => {
        if (!cancelled) {
          setQuotes(res.quotes);
          setTotal(res.total);
        }
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
  }, [status, page]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Sales"
        title="My Quotes"
        subtitle="Every quote you've generated, with its customer price and booking status."
        actions={
          <Button as={Link} to="/packages" variant="outline">
            <Icon name="package" size={16} />
            Browse packages
          </Button>
        }
      />

      <Card
        // The filter is a single control, so it gets a compact strip rather than a full card
        // header — a titled panel around one dropdown is wasted vertical space.
        bodyClassName="flex flex-wrap items-end gap-4 p-4"
      >
        <Select
          label="Filter by status"
          className="w-full sm:w-64"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
        />
        {!loading && (
          <p className="pb-2.5 text-[13px] text-neutral-500">
            <span className="font-semibold text-neutral-900 tabular-nums">{total}</span>{' '}
            quote{total === 1 ? '' : 's'}
          </p>
        )}
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={5} cols={5} />
        </Card>
      ) : quotes.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={status ? 'No quotes match this filter' : 'No quotes yet'}
          description={
            status
              ? 'Try a different status, or clear the filter to see everything.'
              : 'Pick a package from the marketplace, add your markup, and generate a branded quote for your customer.'
          }
          action={
            status ? (
              <Button variant="outline" onClick={() => setStatus('')}>
                Clear filter
              </Button>
            ) : (
              <Button as={Link} to="/packages">
                <Icon name="package" size={16} />
                Browse packages
              </Button>
            )
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="46rem">
            <Table.Head>
              <Table.HeadCell>Package</Table.HeadCell>
              <Table.HeadCell>Lead</Table.HeadCell>
              <Table.HeadCell align="right">Customer price</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">Created</Table.HeadCell>
              <Table.HeadCell align="right">
                <span className="sr-only">Actions</span>
              </Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {quotes.map((q) => (
                <Table.Row key={q.id}>
                  <Table.Cell strong>{q.package?.title}</Table.Cell>
                  <Table.Cell>{q.leadName}</Table.Cell>
                  <Table.Cell align="right" strong>
                    {formatCurrency(q.sellingPrice)}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge status={q.status} />
                  </Table.Cell>
                  <Table.Cell align="right" muted>
                    {formatDate(q.createdAt)}
                  </Table.Cell>
                  <Table.Cell align="right">
                    <Link
                      to={`/quotes/${q.id}`}
                      className="group inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700"
                    >
                      View
                      <Icon
                        name="chevron-right"
                        size={13}
                        className="transition-transform duration-150 group-hover:translate-x-0.5"
                      />
                    </Link>
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

export default MyQuotesPage;
