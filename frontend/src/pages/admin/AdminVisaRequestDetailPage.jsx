import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Spinner, useToast } from '../../components/ui';
import ConfirmModal from '../../components/admin/ConfirmModal';
import RemarksActionModal from '../../components/admin/RemarksActionModal';
import FileViewerModal from '../../components/shared/FileViewerModal';
import VisaStepper from '../../components/visa/VisaStepper';
import VisaPriceCalcPanel from '../../components/visa/VisaPriceCalcPanel';
import { apiDownload, apiGet, apiPost, apiUpload, ApiError } from '../../api/client';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/format';

function AdminDocumentRow({ visaRequestId, passengerId, doc, upload }) {
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={upload ? 'text-success-600' : 'text-neutral-300'}>{upload ? '✓' : '○'}</span>
        <span className="text-sm text-neutral-900">{doc.documentName}</span>
        <Badge variant={doc.isMandatory ? 'warning' : 'neutral'}>
          {doc.isMandatory ? 'Mandatory' : 'Optional'}
        </Badge>
      </div>
      {upload ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setViewerOpen(true)}>
            View
          </Button>
          <FileViewerModal
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            path={`/api/visa-requests/${visaRequestId}/passengers/${passengerId}/documents/${upload.id}/file`}
            title={doc.documentName}
          />
        </>
      ) : (
        <span className="text-sm text-neutral-400">Not uploaded</span>
      )}
    </div>
  );
}

function AdminVisaRequestDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();

  const [visaRequest, setVisaRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [evisaFile, setEvisaFile] = useState(null);
  const [uploadingEvisa, setUploadingEvisa] = useState(false);

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

  const handleComplete = async () => {
    await apiPost(`/api/admin/visa-requests/${id}/complete`);
    setConfirmComplete(false);
    await loadRequest();
    showToast({ variant: 'success', message: 'Visa request marked completed.' });
  };

  const handleRejectApplication = async (remarks) => {
    await apiPost(`/api/admin/visa-requests/${id}/reject-application`, { adminRemarks: remarks });
    setRejectOpen(false);
    await loadRequest();
    showToast({ variant: 'success', message: 'Visa application rejected.' });
  };

  const handleEvisaUpload = async () => {
    if (!evisaFile) {
      showToast({ variant: 'danger', message: 'Choose a PDF before uploading.' });
      return;
    }

    const formData = new FormData();
    formData.append('document', evisaFile);

    setUploadingEvisa(true);
    try {
      await apiUpload(`/api/admin/visa-requests/${id}/evisa-document`, formData);
      setEvisaFile(null);
      await loadRequest();
      showToast({ variant: 'success', message: 'eVisa PDF uploaded.' });
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not upload the eVisa PDF.',
      });
    } finally {
      setUploadingEvisa(false);
    }
  };

  const handleDownloadEvisa = async () => {
    try {
      await apiDownload(`/api/visa-requests/${id}/evisa-document`, {
        filename: `${visaRequest.applicationNumber}-evisa.pdf`,
      });
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not download the eVisa PDF.',
      });
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
  const canComplete = status === 'VISA_PROCESSING_STARTED';
  const canReject = ['APPLICATION_SUBMITTED', 'PENDING_VERIFICATION'].includes(status);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/visa-requests" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to visa requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">{visaRequest.applicationNumber}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {visaRequest.partner?.partnerProfile?.companyName ?? visaRequest.partner?.email} &middot;{' '}
            {visaRequest.visaCountry?.name} &middot;{' '}
            {visaRequest.visaType === 'E_VISA' ? 'eVisa' : 'Regular visa'}
          </p>
        </div>
        <Badge status={status} />
      </div>

      <Card>
        {status === 'REJECTED' ? (
          <Alert variant="danger">This application was rejected.</Alert>
        ) : (
          <VisaStepper status={status} readyToSubmit={visaRequest.documentReadiness.readyToSubmit} />
        )}
      </Card>

      <Card title="Agency">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Company</dt>
            <dd className="text-neutral-900">{visaRequest.partner?.partnerProfile?.companyName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Email</dt>
            <dd className="text-neutral-900">{visaRequest.partner?.email}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Pricing">
        <div className="flex flex-col gap-4">
          <VisaPriceCalcPanel
            baseFee={visaRequest.pricing.baseFeeAtRequest}
            passengerCount={visaRequest.pricing.passengerCount}
            markupAmount={visaRequest.pricing.markupAmount}
          />
          {visaRequest.pricing.feeChangedSinceRequest && (
            <Alert variant="info">
              This country&apos;s fee has changed since this request was created (currently{' '}
              {formatCurrency(visaRequest.pricing.liveCountryFee)}); this request stays locked at
              its original fee of {formatCurrency(visaRequest.pricing.baseFeeAtRequest)}.
            </Alert>
          )}
        </div>
      </Card>

      {visaRequest.visaType === 'E_VISA' && (
        <Card title="eVisa PDF">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-600">
              Upload the issued eVisa PDF while the request is in processing. Partners will only see
              the download option once the application is completed.
            </p>
            {status === 'VISA_PROCESSING_STARTED' && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  label="PDF file"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setEvisaFile(e.target.files?.[0] ?? null)}
                />
                <Button onClick={handleEvisaUpload} loading={uploadingEvisa}>
                  Upload eVisa PDF
                </Button>
              </div>
            )}
            {visaRequest.evisaDocumentAvailable ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-50 px-4 py-3">
                <p className="text-sm text-success-800">An eVisa PDF is already attached to this request.</p>
                <Button variant="outline" size="sm" onClick={handleDownloadEvisa}>
                  Download current PDF
                </Button>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No eVisa PDF uploaded yet.</p>
            )}
          </div>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">
          Passengers ({visaRequest.passengers.length})
        </h2>
        <div className="flex flex-col gap-4">
          {visaRequest.passengers.map((p) => (
            <Card key={p.id} title={p.fullName}>
              <dl className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-neutral-500">Gender</dt>
                  <dd className="text-neutral-900">{p.gender}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Date of birth</dt>
                  <dd className="text-neutral-900">{formatDate(p.dob)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Nationality</dt>
                  <dd className="text-neutral-900">{p.nationality}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Passport number</dt>
                  <dd className="text-neutral-900">{p.passportNumber}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Passport expiry</dt>
                  <dd className="text-neutral-900">{formatDate(p.passportExpiry)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Travel date</dt>
                  <dd className="text-neutral-900">{formatDate(p.travelDate)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Return date</dt>
                  <dd className="text-neutral-900">{formatDate(p.returnDate)}</dd>
                </div>
              </dl>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Documents
              </h4>
              <div className="flex flex-col gap-2">
                {visaRequest.requiredDocuments.map((doc) => (
                  <AdminDocumentRow
                    key={doc.id}
                    visaRequestId={id}
                    passengerId={p.id}
                    doc={doc}
                    upload={p.documentUploads.find((u) => u.documentName === doc.documentName)}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card title={`Payment history (${visaRequest.payments.length})`} bodyClassName="p-0">
        {visaRequest.payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">No payments submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Transaction ID</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Remarks</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {visaRequest.payments.map((pay) => (
                  <tr key={pay.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">{pay.transactionId}</td>
                    <td className="px-5 py-3 text-neutral-700">{formatCurrency(pay.amount)}</td>
                    <td className="px-5 py-3">
                      <Badge status={pay.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{pay.adminRemarks ?? '—'}</td>
                    <td className="px-5 py-3 text-neutral-500">{formatDateTime(pay.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(canComplete || canReject) && (
        <div className="flex flex-wrap gap-3">
          {canComplete && <Button onClick={() => setConfirmComplete(true)}>Mark Completed</Button>}
          {canReject && (
            <Button variant="danger" onClick={() => setRejectOpen(true)}>
              Reject Application
            </Button>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        title="Mark visa completed"
        description="This marks the visa application as finished and notifies the partner."
        confirmLabel="Mark Completed"
        onConfirm={handleComplete}
      />

      <RemarksActionModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject application"
        description="This kills the whole application outright — distinct from rejecting a single payment. The partner cannot resubmit. Explain why."
        remarksRequired
        confirmLabel="Reject Application"
        confirmVariant="danger"
        onConfirm={handleRejectApplication}
      />
    </div>
  );
}

export default AdminVisaRequestDetailPage;
