import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Select, Spinner } from '../../components/ui';
import PassengerForm from '../../components/visa/PassengerForm';
import VisaPriceCalcPanel from '../../components/visa/VisaPriceCalcPanel';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { emptyPassenger, passengerPayload, validatePassengers } from '../../lib/visaValidators';
import { VISA_CATEGORY_LABELS, formatProcessingTime } from '../../lib/visaProducts';

function NewVisaRequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // The marketplace links here with ?productId=..., since a country alone cannot say WHICH of its
  // visa options the partner picked, and the fee we freeze comes from the product.
  const [visaProductId, setVisaProductId] = useState(searchParams.get('productId') ?? '');
  const [visaType, setVisaType] = useState('REGULAR');
  const [passengers, setPassengers] = useState([emptyPassenger()]);
  const [markupAmount, setMarkupAmount] = useState('0');
  const [productError, setProductError] = useState(null);
  const [visaTypeError, setVisaTypeError] = useState(null);
  const [passengerErrors, setPassengerErrors] = useState([]);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === visaProductId);

  useEffect(() => {
    apiGet('/api/visa-products')
      .then((res) => {
        // Visa-free and visa-on-arrival entries are excluded: they are informational, and the API
        // would reject a request against them anyway. Better to never offer the choice.
        setProducts(res.products.filter((p) => p.applicable));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load visa products.'))
      .finally(() => setLoadingProducts(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    let hasErrors = false;
    if (!visaProductId) {
      setProductError('Please select a visa');
      hasErrors = true;
    } else {
      setProductError(null);
    }

    if (!visaType) {
      setVisaTypeError('Please select a visa type');
      hasErrors = true;
    } else {
      setVisaTypeError(null);
    }

    const { errors, hasErrors: passengerHasErrors } = validatePassengers(passengers);
    setPassengerErrors(errors);
    if (passengerHasErrors) hasErrors = true;

    if (hasErrors) return;

    setSubmitting(true);
    try {
      const res = await apiPost('/api/visa-requests', {
        visaProductId,
        visaType,
        passengers: passengers.map(passengerPayload),
        markupAmount: Number(markupAmount) || 0,
      });
      navigate(`/visa/${res.visaRequest.id}`, {
        state: { justCreated: true, applicationNumber: res.applicationNumber },
      });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProducts) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return <Alert variant="danger">{loadError}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">New Visa Request</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pick the visa, choose how it will be delivered, and add every passenger travelling on
          this application.
        </p>
      </div>

      <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Card title="1. Visa">
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Destination and visa"
              required
              value={visaProductId}
              onChange={(e) => setVisaProductId(e.target.value)}
              error={productError}
              hint={
                selectedProduct
                  ? `${VISA_CATEGORY_LABELS[selectedProduct.category] ?? selectedProduct.category} — ${formatProcessingTime(selectedProduct)}`
                  : undefined
              }
              options={[
                { value: '', label: 'Select a visa...' },
                ...products.map((p) => ({
                  value: p.id,
                  label: `${p.visaCountry.name} — ${p.name}`,
                })),
              ]}
            />
            <Select
              label="Visa type"
              required
              value={visaType}
              onChange={(e) => setVisaType(e.target.value)}
              error={visaTypeError}
              hint={
                visaType === 'E_VISA'
                  ? 'Completed eVisa requests can later include a downloadable PDF.'
                  : undefined
              }
              options={[
                { value: 'REGULAR', label: 'Regular visa' },
                { value: 'E_VISA', label: 'eVisa' },
              ]}
            />
          </div>
        </Card>

        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            2. Passengers
          </h2>
          <PassengerForm passengers={passengers} setPassengers={setPassengers} errors={passengerErrors} />
        </div>

        {visaProductId && (
          <Card title="3. Pricing">
            <div className="flex flex-col gap-4">
              <Input
                label="Your markup"
                type="number"
                min="0"
                step="0.01"
                value={markupAmount}
                onChange={(e) => setMarkupAmount(e.target.value)}
                hint="Added on top of the visa fee — this is your profit."
              />
              <VisaPriceCalcPanel
                adultFee={selectedProduct?.adultFee ?? 0}
                childFee={selectedProduct?.childFee ?? 0}
                adultCount={passengers.filter((p) => p.passengerType !== 'CHILD').length}
                childCount={passengers.filter((p) => p.passengerType === 'CHILD').length}
                markupAmount={markupAmount}
              />
            </div>
          </Card>
        )}

        <Button type="submit" loading={submitting} className="w-full sm:w-auto sm:self-end">
          Create Visa Request
        </Button>
      </form>
    </div>
  );
}

export default NewVisaRequestPage;
