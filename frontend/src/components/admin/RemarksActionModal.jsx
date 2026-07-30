import { useState } from 'react';
import { Alert, Button, Modal, Textarea } from '../ui';
import { ApiError } from '../../api/client';

/** Confirm dialog with a remarks field, for the payment-queue actions (approve/reject/request-info).
 * `remarksRequired` mirrors the backend's own rule: optional on approve, required on the other two. */
function RemarksActionModal({
  open,
  onClose,
  title,
  description,
  remarksRequired,
  confirmLabel,
  confirmVariant = 'primary',
  onConfirm,
}) {
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setApiError(null);
    if (remarksRequired && !remarks.trim()) {
      setRemarksError('Remarks are required — explain what the partner must fix.');
      return;
    }
    setRemarksError(null);

    setLoading(true);
    try {
      await onConfirm(remarks.trim() || undefined);
      setRemarks('');
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setRemarks('');
    setRemarksError(null);
    setApiError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} loading={loading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {apiError && (
        <Alert variant="danger" className="mb-3">
          {apiError}
        </Alert>
      )}
      <p className="mb-4 text-sm text-neutral-600">{description}</p>
      <Textarea
        label="Remarks"
        required={remarksRequired}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        error={remarksError}
        hint={!remarksRequired && !remarksError ? 'Optional' : undefined}
      />
    </Modal>
  );
}

export default RemarksActionModal;
