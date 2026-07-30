import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Spinner, useToast } from '../../components/ui';
import VisaStepper from '../../components/visa/VisaStepper';
import ReadinessPanel from '../../components/visa/ReadinessPanel';
import PassengerCard from '../../components/visa/PassengerCard';
import PassengerForm from '../../components/visa/PassengerForm';
import VisaPriceCalcPanel from '../../components/visa/VisaPriceCalcPanel';
import { apiDownload, apiGet, apiPatch, ApiError } from '../../api/client';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { passengerPayload, validatePassengers } from '../../lib/visaValidators';

const EDITABLE_STATUSES = ['APPLICATION_SUBMITTED'];

/** Pricing card: shows the fee x passengers + markup breakdown, with a standalone markup editor
 * while the request is still editable. Deliberately separate from the passenger-edit form below —
 * PATCHing markupAmount alone must not go through the passenger replace-pattern, which would
 * archive every passenger's uploaded documents for no reason (see visaRequestService.update). */
function PricingCard({ visaRequest, isEditable, onSaved }) {
  const { pricing } = visaRequest;
  const { showToast } = useToast();

  const [editingMarkup, setEditingMarkup] = useState(false);
  const [markupAmount, setMarkupAmount] = useState(String(pricing.markupAmount));
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloadingEvisa, setDownloadingEvisa] = useState(false);

  const startEdit = () => {
    setMarkupAmount(String(pricing.markupAmount));
    setFormError(null);
    setEditingMarkup(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await apiPatch(`/api/visa-requests/${visaRequest.id}`, { markupAmount: Number(markupAmount) || 0 });
      setEditingMarkup(false);
      showToast({ variant: 'success', message: 'Markup updated.' });
      await onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Pricing">
      {formError && (
        <Alert variant="danger" className="mb-3">
          {formError}
        </Alert>
      )}

      {editingMarkup ? (
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
            baseFee={pricing.baseFeeAtRequest}
            passengerCount={pricing.passengerCount}
            markupAmount={markupAmount}
          />
          <div className="flex gap-3 self-end">
            <button
              type="button"
              onClick={() => setEditingMarkup(false)}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
            >
              Cancel
            </button>
            <Button loading={saving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <VisaPriceCalcPanel
            baseFee={pricing.baseFeeAtRequest}
            passengerCount={pricing.passengerCount}
            markupAmount={pricing.markupAmount}
          />
          {pricing.feeChangedSinceRequest && (
            <Alert variant="info">
              TravNexa has repriced this country since your application; your price is locked at
              the original fee.
            </Alert>
          )}
          {isEditable && (
            <Button variant="outline" size="sm" className="self-end" onClick={startEdit}>
              Edit markup
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function toFormPassenger(p) {
  return {
    _key: p.id,
    fullName: p.fullName,
    gender: p.gender,
    dob: p.dob.slice(0, 10),
    nationality: p.nationality,
    passportNumber: p.passportNumber,
    passportExpiry: p.passportExpiry.slice(0, 10),
    travelDate: p.travelDate.slice(0, 10),
    returnDate: p.returnDate.slice(0, 10),
  };
}

function VisaRequestDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [visaRequest, setVisaRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editPassengers, setEditPassengers] = useState([]);
  const [editErrors, setEditErrors] = useState([]);
  const [editFormError, setEditFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRequest = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/visa-requests/${id}`)
      .then((res) => setVisaRequest(res.visaRequest))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load visa request.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startEditing = () => {
    setEditPassengers(visaRequest.passengers.map(toFormPassenger));
    setEditErrors([]);
    setEditFormError(null);
    setEditing(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditFormError(null);

    const { errors, hasErrors } = validatePassengers(editPassengers);
    setEditErrors(errors);
    if (hasErrors) return;

    setSaving(true);
    try {
      await apiPatch(`/api/visa-requests/${id}`, { passengers: editPassengers.map(passengerPayload) });
      setEditing(false);
      await loadRequest();
      showToast({ variant: 'success', message: 'Passengers updated.' });
    } catch (err) {
      setEditFormError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setSaving(false);
    }
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

  const status = visaRequest.status;
  const readiness = visaRequest.documentReadiness;
  const payment = visaRequest.latestPayment;
  const isEditable = EDITABLE_STATUSES.includes(status);
  const isRejected = status === 'REJECTED';

  const paymentEligible =
    status === 'APPLICATION_SUBMITTED' ||
    (status === 'PENDING_VERIFICATION' && payment?.status === 'INFO_REQUESTED');

  const handleDownloadEvisa = async () => {
    setDownloadingEvisa(true);
    try {
      await apiDownload(`/api/visa-requests/${id}/evisa-document`, {
        filename: `${visaRequest.applicationNumber}-evisa.pdf`,
      });
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not download the eVisa PDF.',
      });
    } finally {
      setDownloadingEvisa(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link to="/visa" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to visa services
      </Link>

      {location.state?.justCreated && (
        <Alert variant="success">
          Application {location.state.applicationNumber ?? visaRequest.applicationNumber} created.
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">{visaRequest.applicationNumber}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {visaRequest.visaCountry?.name} · {visaRequest.visaType === 'E_VISA' ? 'eVisa' : 'Regular visa'}
          </p>
        </div>
        <Badge status={status} />
      </div>

      <Card>
        {isRejected ? (
          <Alert variant="danger">This application was rejected.</Alert>
        ) : (
          <VisaStepper status={status} readyToSubmit={readiness.readyToSubmit} />
        )}
      </Card>

      {payment?.status === 'REJECTED' && (
        <Alert variant="danger" title="Payment rejected">
          <p>{payment.adminRemarks || 'Your payment was rejected.'} Please resubmit your payment.</p>
          <Button size="sm" className="mt-3" onClick={() => navigate(`/visa/${id}/payment`)}>
            Resubmit Payment
          </Button>
        </Alert>
      )}

      {payment?.status === 'INFO_REQUESTED' && (
        <Alert variant="warning" title="More information requested">
          <p>{payment.adminRemarks || 'TravNexa needs more information about your payment.'}</p>
          <Button size="sm" className="mt-3" onClick={() => navigate(`/visa/${id}/payment`)}>
            Amend &amp; Resubmit
          </Button>
        </Alert>
      )}

      {payment?.status === 'PENDING_VERIFICATION' && status === 'PENDING_VERIFICATION' && (
        <Alert variant="warning" title="Awaiting TravNexa verification">
          Your payment has been submitted and is awaiting verification — this usually takes 24 to
          48 hours.
        </Alert>
      )}

      {status === 'VISA_PROCESSING_STARTED' && (
        <Alert variant="info" title="Processing has started">
          Payment has been verified and TravNexa is now processing this visa application.
        </Alert>
      )}

      {status === 'COMPLETED' && (
        <Alert variant="success" title="Visa Completed!">
          This visa application has been completed.
          {visaRequest.visaType === 'E_VISA' && visaRequest.evisaDocumentAvailable
            ? ' Your eVisa PDF is ready to download below.'
            : ''}
        </Alert>
      )}

      {payment && (
        <Card title="Payment">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Amount paid</dt>
              <dd className="text-neutral-900">{formatCurrency(payment.amount)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Transaction ID</dt>
              <dd className="text-neutral-900">{payment.transactionId}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Submitted</dt>
              <dd className="text-neutral-900">{formatDateTime(payment.createdAt)}</dd>
            </div>
          </dl>
        </Card>
      )}

      <PricingCard visaRequest={visaRequest} isEditable={isEditable} onSaved={loadRequest} />

      {visaRequest.visaType === 'E_VISA' && (
        <Card title="eVisa document">
          {visaRequest.evisaDocumentAvailable ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-600">
                Download the issued eVisa PDF once operations uploads it after processing.
              </p>
              <Button
                variant="outline"
                loading={downloadingEvisa}
                onClick={handleDownloadEvisa}
                disabled={status !== 'COMPLETED'}
              >
                Download eVisa PDF
              </Button>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              The eVisa PDF will appear here after processing is completed.
            </p>
          )}
        </Card>
      )}

      {!isRejected && status !== 'COMPLETED' && <ReadinessPanel readiness={readiness} />}

      {editing ? (
        <Card title="Edit passengers">
          <form onSubmit={handleEditSubmit} noValidate className="flex flex-col gap-4">
            {editFormError && <Alert variant="danger">{editFormError}</Alert>}
            <PassengerForm passengers={editPassengers} setPassengers={setEditPassengers} errors={editErrors} />
            <div className="flex gap-3 self-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">
              Passengers ({visaRequest.passengers.length})
            </h2>
            {isEditable && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                Edit passengers
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {visaRequest.passengers.map((p) => (
              <PassengerCard
                key={p.id}
                visaRequestId={id}
                passenger={p}
                requiredDocuments={visaRequest.requiredDocuments}
                onUploaded={loadRequest}
              />
            ))}
          </div>

          {paymentEligible && (
            <div>
              <Button disabled={!readiness.readyToSubmit} onClick={() => navigate(`/visa/${id}/payment`)}>
                Proceed to Payment
              </Button>
              {!readiness.readyToSubmit && (
                <p className="mt-2 text-sm text-neutral-500">
                  Upload every mandatory document for all passengers before paying.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default VisaRequestDetailPage;
