import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Select, Spinner } from '../../components/ui';
import PassengerForm from '../../components/visa/PassengerForm';
import VisaPriceCalcPanel from '../../components/visa/VisaPriceCalcPanel';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { emptyPassenger, passengerPayload, validatePassengers } from '../../lib/visaValidators';

function NewVisaRequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [countries, setCountries] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [visaCountryId, setVisaCountryId] = useState(searchParams.get('countryId') ?? '');
  const [passengers, setPassengers] = useState([emptyPassenger()]);
  const [markupAmount, setMarkupAmount] = useState('0');
  const [countryError, setCountryError] = useState(null);
  const [passengerErrors, setPassengerErrors] = useState([]);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCountry = countries.find((c) => c.id === visaCountryId);

  useEffect(() => {
    apiGet('/api/visa-countries')
      .then((res) => setCountries(res.countries))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load countries.'))
      .finally(() => setLoadingCountries(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    let hasErrors = false;
    if (!visaCountryId) {
      setCountryError('Please select a destination country');
      hasErrors = true;
    } else {
      setCountryError(null);
    }

    const { errors, hasErrors: passengerHasErrors } = validatePassengers(passengers);
    setPassengerErrors(errors);
    if (passengerHasErrors) hasErrors = true;

    if (hasErrors) return;

    setSubmitting(true);
    try {
      const res = await apiPost('/api/visa-requests', {
        visaCountryId,
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

  if (loadingCountries) {
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
          Pick a destination and add every passenger travelling on this application.
        </p>
      </div>

      <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Card title="1. Destination country">
          <Select
            label="Country"
            required
            value={visaCountryId}
            onChange={(e) => setVisaCountryId(e.target.value)}
            error={countryError}
            options={[
              { value: '', label: 'Select a country...' },
              ...countries.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Card>

        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            2. Passengers
          </h2>
          <PassengerForm passengers={passengers} setPassengers={setPassengers} errors={passengerErrors} />
        </div>

        {visaCountryId && (
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
                baseFee={selectedCountry?.baseFee ?? 0}
                passengerCount={passengers.length}
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
