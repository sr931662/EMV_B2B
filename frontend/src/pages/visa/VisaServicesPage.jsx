import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Pagination,
  PageHeader,
  Skeleton,
  Table,
} from '../../components/ui';
import VisaProductFilters from '../../components/visa/VisaProductFilters';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';
import {
  VISA_CATEGORY_LABELS,
  DOCUMENT_PROFILE_LABELS,
  ENTRY_TYPE_LABELS,
  formatProcessingTime,
  formatValidity,
  formatMaxStay,
  describeFeasibility,
} from '../../lib/visaProducts';

const PRODUCTS_PAGE_SIZE = 24;
const REQUESTS_PAGE_SIZE = 50;

// Filter state lives in the URL so a filtered marketplace is a shareable link and the back button
// walks through filter changes. Empty string means "not filtering on this".
const EMPTY_FILTERS = {
  maxProcessingDays: '',
  category: '',
  documentProfile: '',
  travelDate: '',
  onlyFeasible: false,
};

function filtersFromSearchParams(params) {
  return {
    maxProcessingDays: params.get('maxProcessingDays') ?? '',
    category: params.get('category') ?? '',
    documentProfile: params.get('documentProfile') ?? '',
    travelDate: params.get('travelDate') ?? '',
    onlyFeasible: params.get('onlyFeasible') === 'true',
  };
}

/** Drops empty values so the query string stays readable and the API never sees `category=`. */
function buildQuery(filters) {
  const query = new URLSearchParams();

  if (filters.maxProcessingDays) query.set('maxProcessingDays', filters.maxProcessingDays);
  if (filters.category) query.set('category', filters.category);
  if (filters.documentProfile) query.set('documentProfile', filters.documentProfile);
  if (filters.travelDate) query.set('travelDate', filters.travelDate);
  // Only meaningful alongside a travel date — on its own the server has nothing to judge.
  if (filters.travelDate && filters.onlyFeasible) query.set('onlyFeasible', 'true');

  return query;
}

/** The URL carries filters only, not the page — a filter change always lands back on page 1. */
function buildProductsQuery(filters, page) {
  const query = buildQuery(filters);
  query.set('limit', String(PRODUCTS_PAGE_SIZE));
  query.set('offset', String((page - 1) * PRODUCTS_PAGE_SIZE));
  return query.toString();
}

function ProductCard({ product, travelDate }) {
  const feasibility = describeFeasibility(product.feasibility);
  const mandatoryDocs = product.requiredDocuments?.filter((d) => d.isMandatory) ?? [];
  const country = product.visaCountry;

  // Validity, stay and entry type are only shown once an admin has filled them in — a blank
  // number rendered as "0 days" or "— days" reads like a real limit rather than a missing one.
  const facts = [formatValidity(product.validityDays), formatMaxStay(product.maxStayDays)].filter(
    Boolean
  );

  return (
    <div className="surface flex flex-col overflow-hidden rounded-xl">
      {country.coverImageUrl ? (
        <div className="relative h-28 w-full">
          <img
            src={country.coverImageUrl}
            alt=""
            // Decorative: the country name is already right below in text, so announcing the
            // image again would just be noise for a screen reader.
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <span className="absolute right-2 top-2">
            <Badge variant="neutral">{VISA_CATEGORY_LABELS[product.category] ?? product.category}</Badge>
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          {country.flagImageUrl ? (
            <img
              src={country.flagImageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-6 w-9 rounded object-cover ring-1 ring-neutral-200"
            />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
              <Icon name="globe" size={17} />
            </span>
          )}
          {!country.coverImageUrl && (
            <Badge variant="neutral">{VISA_CATEGORY_LABELS[product.category] ?? product.category}</Badge>
          )}
        </div>

        <div>
          <Link
            to={`/visa/products/${product.id}${travelDate ? `?travelDate=${travelDate}` : ''}`}
            className="text-[15px] font-semibold leading-snug text-neutral-900 hover:text-primary-700"
          >
            {country.shortName || country.name}
          </Link>
          <p className="mt-0.5 text-[13px] text-neutral-500">{product.name}</p>
          {facts.length > 0 && (
            <p className="mt-1 text-[12px] text-neutral-500">
              {facts.join(' · ')} · {ENTRY_TYPE_LABELS[product.entryType] ?? product.entryType}
            </p>
          )}
        </div>

      <dl className="flex flex-col gap-1.5 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-neutral-500">Processing</dt>
          <dd className="font-medium text-neutral-800">{formatProcessingTime(product)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-neutral-500">Documents</dt>
          <dd
            className="font-medium text-neutral-800"
            // The full checklist on hover, per the brief. title is deliberate rather than a custom
            // tooltip: it works on keyboard focus and screen readers for free.
            title={
              mandatoryDocs.length
                ? mandatoryDocs.map((d) => d.documentName).join('\n')
                : 'No product-specific documents beyond the standard set'
            }
          >
            {DOCUMENT_PROFILE_LABELS[product.documentProfile] ?? product.documentProfile}
          </dd>
        </div>
        {product.applicable && (
          <>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-neutral-500">Adult</dt>
              <dd className="font-medium text-neutral-800 tabular-nums">
                {formatCurrency(product.adultFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-neutral-500">Child</dt>
              <dd className="font-medium text-neutral-800 tabular-nums">
                {Number(product.childFee) === 0 ? 'Free' : formatCurrency(product.childFee)}
              </dd>
            </div>
          </>
        )}
      </dl>

      {feasibility && (
        <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 px-3 py-2">
          <Badge variant={feasibility.variant}>{feasibility.label}</Badge>
          {product.feasibility.status === 'READY_IN_TIME' && (
            <p className="text-[12px] text-neutral-600">
              Apply by <strong>{formatDate(product.feasibility.applyBy)}</strong>
            </p>
          )}
        </div>
      )}

      {product.applicable ? (
        <Button as={Link} to={`/visa/new?productId=${product.id}`} size="sm" className="mt-auto">
          Apply
          <Icon name="chevron-right" size={14} />
        </Button>
      ) : (
        // No apply action on purpose: there is no application to submit for a visa-free or
        // visa-on-arrival destination, and offering one would create requests nobody can fulfil.
        <p className="mt-auto rounded-lg bg-success-50 px-3 py-2 text-[12px] text-success-700">
          No advance visa needed on an Indian passport — travel on arrival.
        </p>
        )}
      </div>
    </div>
  );
}

function VisaServicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);

  const [products, setProducts] = useState([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState(1);
  const [requests, setRequests] = useState([]);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [requestsPage, setRequestsPage] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState(null);

  const queryString = buildQuery(filters).toString();

  // A filter change can leave `productsPage` pointing past the new, narrower result set.
  useEffect(() => {
    setProductsPage(1);
  }, [queryString]);

  useEffect(() => {
    let cancelled = false;

    setLoadingProducts(true);
    setError(null);
    apiGet(`/api/visa-products?${buildProductsQuery(filters, productsPage)}`)
      .then((res) => {
        if (!cancelled) {
          setProducts(res.products);
          setProductsTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load visa products.');
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, productsPage]);

  // Separate from the products request: the partner's own request list does not change when they
  // move a filter, so refetching it on every keystroke would be wasted work.
  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({
      limit: String(REQUESTS_PAGE_SIZE),
      offset: String((requestsPage - 1) * REQUESTS_PAGE_SIZE),
    });

    apiGet(`/api/visa-requests?${params.toString()}`)
      .then((res) => {
        if (!cancelled) {
          setRequests(res.visaRequests);
          setRequestsTotal(res.total);
        }
      })
      .catch(() => {
        // Non-fatal: the marketplace above is still usable if this list fails.
      })
      .finally(() => {
        if (!cancelled) setLoadingRequests(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestsPage]);

  const handleFilterChange = useCallback(
    (next) => {
      // replace, not push: dragging through a select should not bury the previous page under a
      // dozen history entries.
      setSearchParams(buildQuery(next), { replace: true });
    },
    [setSearchParams]
  );

  const handleReset = useCallback(() => {
    setSearchParams(buildQuery(EMPTY_FILTERS), { replace: true });
  }, [setSearchParams]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Visa desk"
        title="Visa Products"
        subtitle="Filter by how fast you need it, what kind of visa it is, and what documents your client can provide."
        actions={
          <Button as={Link} to="/visa/new">
            <Icon name="plus" size={16} />
            Apply for a visa
          </Button>
        }
      />

      <VisaProductFilters
        value={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
        resultCount={productsTotal}
        loading={loadingProducts}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {loadingProducts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton.Stat key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon="globe"
          title="No visas match these filters"
          description="Try widening the delivery time, or clearing the documents filter. Visas with no published timeline are hidden whenever a delivery duration is selected."
          action={
            <Button variant="outline" onClick={handleReset}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} travelDate={filters.travelDate} />
            ))}
          </div>
          <Card bodyClassName="p-0">
            <Pagination
              page={productsPage}
              pageSize={PRODUCTS_PAGE_SIZE}
              total={productsTotal}
              onPageChange={setProductsPage}
              loading={loadingProducts}
            />
          </Card>
        </>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">My visa requests</h2>

        {loadingRequests ? (
          <Skeleton.Stat />
        ) : requests.length === 0 ? (
          <EmptyState
            icon="plane"
            title="No visa requests yet"
            description="Pick a visa above to start your first application. You'll upload passenger documents before paying."
          />
        ) : (
          <Card bodyClassName="p-0">
            <Table minWidth="48rem">
              <Table.Head>
                <Table.HeadCell>Application</Table.HeadCell>
                <Table.HeadCell>Country</Table.HeadCell>
                <Table.HeadCell>Visa</Table.HeadCell>
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
                    {/* Null for requests created before visa products existed. */}
                    <Table.Cell muted={!r.productName}>{r.productName ?? '—'}</Table.Cell>
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
            <Pagination
              page={requestsPage}
              pageSize={REQUESTS_PAGE_SIZE}
              total={requestsTotal}
              onPageChange={setRequestsPage}
              loading={loadingRequests}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

export default VisaServicesPage;
