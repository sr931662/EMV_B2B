import { useState } from 'react';
import { Alert, Button, Modal } from '../ui';
import { ApiError } from '../../api/client';

/** Simple yes/no confirmation — used for agency suspend/activate. For actions that need a
 * remarks field, see RemarksActionModal instead. */
function ConfirmModal({ open, onClose, title, description, confirmLabel, confirmVariant = 'primary', onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} loading={loading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <p className="text-sm text-neutral-600">{description}</p>
    </Modal>
  );
}

export default ConfirmModal;
