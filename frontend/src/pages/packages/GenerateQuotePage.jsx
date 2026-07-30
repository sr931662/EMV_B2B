import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Card, Spinner } from '../../components/ui';
import QuoteForm from '../../components/quotes/QuoteForm';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';

function GenerateQuotePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pkg, setPkg] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    apiGet(`/api/packages/${id}`)
      .then((res) => {
        if (!cancelled) setPkg(res.package);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load package.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (payload) => {
    const res = await apiPost('/api/quotes', { packageId: id, ...payload });
    navigate(`/quotes/${res.quote.id}`);
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

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/packages/${id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700">
        &larr; Back to package
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Generate Quote</h1>
        <p className="mt-1 text-sm text-neutral-500">Set your markup and prepare a quote for your customer.</p>
      </div>

      <Card bodyClassName="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-neutral-900">{pkg.title}</h2>
          <p className="text-sm text-neutral-500">
            {pkg.destination?.name} &middot; {pkg.days} days / {pkg.nights} nights
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">TravNexa Cost</p>
          <p className="text-lg font-semibold text-neutral-900">{formatCurrency(pkg.rawPrice)}</p>
        </div>
      </Card>

      <Card>
        <QuoteForm pkg={pkg} submitLabel="Generate Quote" onSubmit={handleSubmit} />
      </Card>
    </div>
  );
}

export default GenerateQuotePage;
