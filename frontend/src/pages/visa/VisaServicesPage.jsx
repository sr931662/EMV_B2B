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
  Table,
} from '../../components/ui';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

function VisaServicesPage() {
  const [countries, setCountries] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    Promise.all([apiGet('/api/visa-countries'), apiGet('/api/visa-requests')])
      .then(([countriesRes, requestsRes]) => {
        if (cancelled) return;
        setCountries(countriesRes.countries);
        setRequests(requestsRes.visaRequests);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load visa services.');
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

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Visa Services" subtitle="Loading destinations…" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton.Stat key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Visa desk"
        title="Visa Services"
        subtitle="Apply for a visa on behalf of your customer and track every application to completion."
        actions={
          <Button as={Link} to="/visa/new">
            <Icon name="plus" size={16} />
            Apply for a visa
          </Button>
        }
      />

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">Destinations</h2>
          <p className="mt-0.5 text-[13px] text-neutral-500">
            Per-passenger base fee — your markup is added when you apply.
          </p>
        </div>

        {countries.length === 0 ? (
          <EmptyState
            icon="globe"
            title="No visa destinations configured"
            description="TravNexa hasn't published any visa countries yet. Check back shortly."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {countries.map((c) => (
              <Link
                key={c.id}
                to={`/visa/new?countryId=${c.id}`}
                className="group surface flex flex-col gap-3 rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                    <Icon name="globe" size={17} />
                  </span>
                  <Icon
                    name="arrow-up-right"
                    size={15}
                    className="text-neutral-300 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:text-primary-600"
                  />
                </div>

                <div>
                  <p className="text-[15px] font-semibold leading-snug text-neutral-900 group-hover:text-primary-700">
                    {c.name}
                  </p>
                  <p className="mt-1 text-[13px] text-neutral-500">
                    <span className="font-medium text-neutral-800 tabular-nums">
                      {formatCurrency(c.baseFee)}
                    </span>{' '}
                    / passenger
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">My visa requests</h2>

        {requests.length === 0 ? (
          <EmptyState
            icon="plane"
            title="No visa requests yet"
            description="Pick a destination above to start your first application. You'll upload passenger documents before paying."
            action={
              <Button as={Link} to="/visa/new">
                <Icon name="plus" size={16} />
                Apply for a visa
              </Button>
            }
          />
        ) : (
          <Card bodyClassName="p-0">
            <Table minWidth="44rem">
              <Table.Head>
                <Table.HeadCell>Application</Table.HeadCell>
                <Table.HeadCell>Country</Table.HeadCell>
                <Table.HeadCell align="right">Passengers</Table.HeadCell>
                <Table.HeadCell align="right">Total</Table.HeadCell>
                <Table.HeadCell>Status</Table.HeadCell>
                <Table.HeadCell align="right">Created</Table.HeadCell>
                <Table.HeadCell align="right">
                  <span className="sr-only">Actions</span>
                </Table.HeadCell>
              </Table.Head>
              <Table.Body>
                {requests.map((r) => (
                  <Table.Row key={r.id}>
                    <Table.Cell strong>
                      <span className="font-mono text-[12px]">{r.applicationNumber}</span>
                    </Table.Cell>
                    <Table.Cell>{r.countryName}</Table.Cell>
                    <Table.Cell align="right">{r.passengerCount}</Table.Cell>
                    <Table.Cell align="right" strong>
                      {formatCurrency(r.sellingPrice)}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge status={r.status} />
                    </Table.Cell>
                    <Table.Cell align="right" muted>
                      {formatDate(r.createdAt)}
                    </Table.Cell>
                    <Table.Cell align="right">
                      <Link
                        to={`/visa/${r.id}`}
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
          </Card>
        )}
      </div>
    </div>
  );
}

export default VisaServicesPage;
