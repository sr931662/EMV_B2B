import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Skeleton,
} from '../../components/ui';
import MarkdownContent from '../../components/shared/MarkdownContent';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';
import {
  VISA_CATEGORY_LABELS,
  DOCUMENT_PROFILE_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  ENTRY_TYPE_LABELS,
  formatProcessingTime,
  formatValidity,
  formatMaxStay,
  describeFeasibility,
} from '../../lib/visaProducts';

/**
 * The "card details page" from the brief: hero, arrival info, what you need to apply, the
 * processing timeline broken into steps, FAQs, and other visas worth comparing.
 *
 * Every section renders only when it has content. An admin who has not written the FAQs yet gets
 * a shorter page rather than a page full of empty headings promising information that is not
 * there.
 */

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

function Timeline({ steps, summary }) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-0">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[12px] font-semibold text-white">
                {index + 1}
              </span>
              {/* The connector is drawn on every step but the last, so the track reads as one
                  continuous line rather than a column of disconnected bullets. */}
              {index < steps.length - 1 && <span className="w-px flex-1 bg-primary-200" />}
            </div>
            <div className="pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-medium text-neutral-900">{step.title}</p>
                {step.estimatedDays !== null && step.estimatedDays !== undefined ? (
                  <Badge variant="neutral">
                    {step.estimatedDays === 0
                      ? 'Same day'
                      : `${step.estimatedDays} working ${step.estimatedDays === 1 ? 'day' : 'days'}`}
                  </Badge>
                ) : (
                  <Badge variant="neutral">Varies</Badge>
                )}
              </div>
              {step.description && (
                <p className="mt-1 text-[13px] leading-6 text-neutral-600">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {summary && (
        <p className="text-[13px] text-neutral-500">
          {summary.complete
            ? `Total ${summary.totalDays} working days across ${summary.stepCount} steps.`
            : `${summary.stepCount} steps; some have no fixed duration, so the total varies.`}
        </p>
      )}
    </div>
  );
}

function SimilarCard({ product }) {
  return (
    <Link
      to={`/visa/products/${product.id}`}
      className="surface flex flex-col gap-1 rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="text-[14px] font-semibold text-neutral-900">
        {product.visaCountry.shortName || product.visaCountry.name}
      </p>
      <p className="text-[12px] text-neutral-500">{product.name}</p>
      <p className="mt-1 text-[12px] text-neutral-600">
        {formatProcessingTime(product)}
        {product.applicable ? ` · ${formatCurrency(product.adultFee)}` : ''}
      </p>
    </Link>
  );
}

function VisaProductDetailPage() {
  const { id } = useParams();
  // Carried through from the marketplace so the delivery answer on this page matches the one the
  // partner just saw on the card, without them re-entering the date.
  const [searchParams] = useSearchParams();
  const travelDate = searchParams.get('travelDate') ?? '';

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ includeSimilar: 'true' });
    if (travelDate) query.set('travelDate', travelDate);

    apiGet(`/api/visa-products/${id}?${query.toString()}`)
      .then((res) => {
        if (!cancelled) setProduct(res.product);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load this visa.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, travelDate]);

  if (loading) return <Skeleton.Stat />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!product) return null;

  const country = product.visaCountry;
  const feasibility = describeFeasibility(product.feasibility);
  const facts = [
    formatValidity(product.validityDays),
    formatMaxStay(product.maxStayDays),
    ENTRY_TYPE_LABELS[product.entryType] ?? product.entryType,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <Link
        to="/visa"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
      >
        <Icon name="arrow-left" size={14} />
        All visas
      </Link>

      <div className="surface overflow-hidden rounded-2xl">
        {country.coverImageUrl && (
          <img
            src={country.coverImageUrl}
            alt=""
            aria-hidden="true"
            className="h-44 w-full object-cover sm:h-56"
          />
        )}
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            {country.flagImageUrl && (
              <img
                src={country.flagImageUrl}
                alt=""
                aria-hidden="true"
                className="h-7 w-10 rounded object-cover ring-1 ring-neutral-200"
              />
            )}
            <div>
              <h1 className="text-[22px] font-semibold leading-tight text-neutral-900 sm:text-[26px]">
                {country.name}
              </h1>
              <p className="text-[14px] text-neutral-500">{product.name}</p>
            </div>
            <Badge variant="neutral">
              {VISA_CATEGORY_LABELS[product.category] ?? product.category}
            </Badge>
          </div>

          {facts.length > 0 && <p className="text-[13px] text-neutral-600">{facts.join(' · ')}</p>}

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Processing</p>
              <p className="text-[15px] font-semibold text-neutral-900">
                {formatProcessingTime(product)}
              </p>
            </div>
            {product.applicable && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Adult</p>
                  <p className="text-[15px] font-semibold text-neutral-900">
                    {formatCurrency(product.adultFee)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Child</p>
                  <p className="text-[15px] font-semibold text-neutral-900">
                    {Number(product.childFee) === 0 ? 'Free' : formatCurrency(product.childFee)}
                  </p>
                </div>
              </>
            )}
          </div>

          {feasibility && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2">
              <Badge variant={feasibility.variant}>{feasibility.label}</Badge>
              {product.feasibility.status === 'READY_IN_TIME' && (
                <span className="text-[13px] text-neutral-600">
                  Apply by <strong>{formatDate(product.feasibility.applyBy)}</strong> for travel on{' '}
                  {formatDate(travelDate)}
                </span>
              )}
            </div>
          )}

          {product.applicable ? (
            <Button as={Link} to={`/visa/new?productId=${product.id}`} className="w-fit">
              Apply for this visa
              <Icon name="chevron-right" size={15} />
            </Button>
          ) : (
            <Alert variant="success">
              No advance visa is needed on an Indian passport for this destination — there is
              nothing to apply for here.
            </Alert>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          {country.aboutCountry && (
            <Section title={`About ${country.name}`}>
              <Card>
                <MarkdownContent content={country.aboutCountry} />
              </Card>
            </Section>
          )}

          {country.arrivalInfo && (
            <Section title="On arrival">
              <Card>
                <MarkdownContent content={country.arrivalInfo} />
              </Card>
            </Section>
          )}

          {product.processingSteps?.length > 0 && (
            <Section title="Processing timeline">
              <Card>
                <Timeline steps={product.processingSteps} summary={product.timeline} />
              </Card>
            </Section>
          )}

          {product.faqs && (
            <Section title="FAQs">
              <Card>
                <MarkdownContent content={product.faqs} />
              </Card>
            </Section>
          )}
        </div>

        {/* Right rail, per the brief: "Right side displays documents required for each Visa
            service." Sticky so it stays in view while the timeline and FAQs are read. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card title="Documents required">
            <p className="mb-3 text-[13px] text-neutral-500">
              This visa reads as{' '}
              <strong>{DOCUMENT_PROFILE_LABELS[product.documentProfile] ?? product.documentProfile}</strong>.
            </p>
            {product.requiredDocuments?.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {product.requiredDocuments.map((doc) => (
                  <li key={doc.id} className="flex items-start gap-2 text-[13px]">
                    <Icon
                      name={doc.isMandatory ? 'check-circle' : 'info'}
                      size={15}
                      className={doc.isMandatory ? 'mt-0.5 text-primary-600' : 'mt-0.5 text-neutral-400'}
                    />
                    <span>
                      <span className="text-neutral-800">{doc.documentName}</span>
                      <span className="ml-1 text-neutral-400">
                        ({DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}
                        {doc.isMandatory ? '' : ', optional'})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-neutral-500">
                Only the standard set (passport, PAN, photo, tickets, hotel voucher, bank
                statement) — no extras for this visa.
              </p>
            )}
          </Card>
        </aside>
      </div>

      {product.similarProducts?.length > 0 && (
        <Section title="Other visas to compare">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {product.similarProducts.map((p) => (
              <SimilarCard key={p.id} product={p} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export default VisaProductDetailPage;
