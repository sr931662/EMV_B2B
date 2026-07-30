import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import FileViewerModal from '../../components/shared/FileViewerModal';
import RemarksActionModal from '../../components/admin/RemarksActionModal';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { formatCurrency, formatDateTime } from '../../lib/format';

const ACTIONABLE_STATUSES = ['PENDING_VERIFICATION', 'INFO_REQUESTED'];

function AdminPaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [payment, setPayment] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // 'approve' | 'reject' | 'request-info'

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    apiGet(`/api/admin/payments/${id}`)
      .then((res) => {
        if (cancelled) return;
        setPayment(res.payment);
        setSummary(res.summary);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load payment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const runAction = async (path, remarks, successMessage) => {
    await apiPost(`/api/admin/payments/${id}/${path}`, remarks ? { adminRemarks: remarks } : {});
    setActiveAction(null);
    showToast({ variant: 'success', message: successMessage });
    navigate('/admin/payments');
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

  const isVisa = payment.type === 'VISA';
  const quote = payment.quote;
  const visaRequest = payment.visaRequest;
  const partner = isVisa ? visaRequest?.partner : quote?.partner;
  const isActionable = ACTIONABLE_STATUSES.includes(payment.status);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/payments" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
            {partner?.partnerProfile?.companyName ?? partner?.email ?? 'Unknown agency'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            <Badge variant="neutral">{payment.type}</Badge>
          </p>
        </div>
        <Badge status={payment.status} />
      </div>

      {payment.reconciliationMismatch && (
        <Alert variant="warning" title="Amount mismatch">
          The partner paid {formatCurrency(payment.amount)}, but the wholesale amount owed to
          TravNexa is {formatCurrency(summary?.amountDue)}. Double-check before approving.
        </Alert>
      )}

      <Card title={isVisa ? 'Visa application' : 'Package quote'}>
        {isVisa ? (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Application number</dt>
              <dd className="text-neutral-900">{visaRequest?.applicationNumber}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Country</dt>
              <dd className="text-neutral-900">{visaRequest?.visaCountry?.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Passengers</dt>
              <dd className="text-neutral-900">{visaRequest?._count?.passengers}</dd>
            </div>
          </dl>
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Package</dt>
              <dd className="text-neutral-900">{quote?.package?.title}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Destination</dt>
              <dd className="text-neutral-900">{quote?.package?.destination?.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Lead name</dt>
              <dd className="text-neutral-900">{quote?.leadName}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Branding</dt>
              <dd className="text-neutral-900">{quote?.branding}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Quote status</dt>
              <dd>
                <Badge status={quote?.status} />
              </dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title="Pricing">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Wholesale (due to TravNexa)</dt>
            <dd className="text-neutral-900">{formatCurrency(summary?.amountDue)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Partner markup</dt>
            <dd className="text-neutral-900">{formatCurrency(summary?.markupAmount)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Customer pays (selling price)</dt>
            <dd className="text-neutral-900">{formatCurrency(summary?.sellingPrice)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-400">
          This payment reconciles against the wholesale amount only — the markup is the partner's
          own profit from their customer and is never paid to TravNexa.
        </p>
      </Card>

      <Card title="Agency">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Company</dt>
            <dd className="text-neutral-900">{partner?.partnerProfile?.companyName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Email</dt>
            <dd className="text-neutral-900">{partner?.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Mobile</dt>
            <dd className="text-neutral-900">{partner?.partnerProfile?.mobile ?? '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Payment">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Amount paid</dt>
            <dd className={payment.reconciliationMismatch ? 'font-semibold text-warning-700' : 'text-neutral-900'}>
              {formatCurrency(payment.amount)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Transaction ID</dt>
            <dd className="text-neutral-900">{payment.transactionId}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Submitted</dt>
            <dd className="text-neutral-900">{formatDateTime(payment.createdAt)}</dd>
          </div>
          {payment.notes && (
            <div className="sm:col-span-3">
              <dt className="text-neutral-500">Partner notes</dt>
              <dd className="whitespace-pre-line text-neutral-900">{payment.notes}</dd>
            </div>
          )}
          {payment.verifiedAt && (
            <>
              <div>
                <dt className="text-neutral-500">Verified by</dt>
                <dd className="text-neutral-900">{payment.verifiedBy?.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Verified at</dt>
                <dd className="text-neutral-900">{formatDateTime(payment.verifiedAt)}</dd>
              </div>
            </>
          )}
          {payment.adminRemarks && (
            <div className="sm:col-span-3">
              <dt className="text-neutral-500">Admin remarks</dt>
              <dd className="whitespace-pre-line text-neutral-900">{payment.adminRemarks}</dd>
            </div>
          )}
        </dl>

        <Button variant="outline" className="mt-4" onClick={() => setViewerOpen(true)}>
          View Screenshot
        </Button>
      </Card>

      {isActionable ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setActiveAction('approve')}>Approve</Button>
          <Button variant="danger" onClick={() => setActiveAction('reject')}>
            Reject
          </Button>
          <Button variant="outline" onClick={() => setActiveAction('request-info')}>
            Request Info
          </Button>
        </div>
      ) : (
        <Alert variant={payment.status === 'APPROVED' ? 'success' : 'info'}>
          This payment has already been {payment.status.toLowerCase()} — no further action needed.
        </Alert>
      )}

      <FileViewerModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        path={`/api/admin/payments/${id}/screenshot`}
        title="Payment proof"
      />

      <RemarksActionModal
        open={activeAction === 'approve'}
        onClose={() => setActiveAction(null)}
        title="Approve payment"
        description="This confirms the booking. The partner will be notified immediately."
        remarksRequired={false}
        confirmLabel="Approve"
        onConfirm={(remarks) => runAction('approve', remarks, 'Payment approved — booking confirmed.')}
      />

      <RemarksActionModal
        open={activeAction === 'reject'}
        onClose={() => setActiveAction(null)}
        title="Reject payment"
        description="The deal stays alive — the partner can resubmit a corrected payment. Explain what's wrong so they can fix it."
        remarksRequired
        confirmLabel="Reject"
        confirmVariant="danger"
        onConfirm={(remarks) => runAction('reject', remarks, 'Payment rejected.')}
      />

      <RemarksActionModal
        open={activeAction === 'request-info'}
        onClose={() => setActiveAction(null)}
        title="Request more information"
        description="The quote/request stays pending while the partner provides what you're asking for."
        remarksRequired
        confirmLabel="Request Info"
        onConfirm={(remarks) => runAction('request-info', remarks, 'Information requested from the partner.')}
      />
    </div>
  );
}

export default AdminPaymentDetailPage;
