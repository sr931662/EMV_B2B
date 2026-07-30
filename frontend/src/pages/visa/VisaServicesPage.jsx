import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner } from '../../components/ui';
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
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Visa Services</h1>
          <p className="mt-1 text-sm text-neutral-500">Apply for a visa on behalf of your customer.</p>
        </div>
        <Link to="/visa/new">
          <Button>Apply for a Visa</Button>
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Countries</h2>
        {countries.length === 0 ? (
          <Card bodyClassName="py-10 text-center">
            <p className="text-neutral-500">No visa countries are configured yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {countries.map((c) => (
              <Link key={c.id} to={`/visa/new?countryId=${c.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md" bodyClassName="text-center">
                  <p className="font-semibold text-neutral-900">{c.name}</p>
                  <p className="mt-1 text-xs text-neutral-400">{formatCurrency(c.baseFee)} / passenger</p>
                  <p className="mt-1 text-xs text-primary-600">Apply &rarr;</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">My Visa Requests</h2>
        {requests.length === 0 ? (
          <Card bodyClassName="py-10 text-center">
            <p className="text-neutral-500">No visa requests yet — apply for your first one above.</p>
          </Card>
        ) : (
          <Card bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="px-5 py-3 font-medium">Application</th>
                    <th className="px-5 py-3 font-medium">Country</th>
                    <th className="px-5 py-3 font-medium">Passengers</th>
                    <th className="px-5 py-3 font-medium">Total</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-5 py-3 text-neutral-900">{r.applicationNumber}</td>
                      <td className="px-5 py-3 text-neutral-700">{r.countryName}</td>
                      <td className="px-5 py-3 text-neutral-700">{r.passengerCount}</td>
                      <td className="px-5 py-3 text-neutral-700">{formatCurrency(r.sellingPrice)}</td>
                      <td className="px-5 py-3">
                        <Badge status={r.status} />
                      </td>
                      <td className="px-5 py-3 text-neutral-500">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/visa/${r.id}`} className="font-medium text-primary-600 hover:text-primary-700">
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
    </div>
  );
}

export default VisaServicesPage;
