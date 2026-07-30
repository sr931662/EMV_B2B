import { useEffect, useState } from 'react';
import { Alert, Spinner } from '../ui';
import Modal from '../ui/Modal';
import { apiFetchBlob, ApiError } from '../../api/client';

/** Large inline view of an authenticated file (payment proof, visa document) — images render
 * directly, PDFs render in an <iframe> (Chrome's built-in PDF viewer). Fetched as an
 * authenticated blob, not a plain <img src>, since these endpoints require a Bearer token.
 * Generic over `path` so it's reused by both the admin payment-proof viewer and the visa
 * document viewer (partner + admin). */
function FileViewerModal({ open, onClose, path, title = 'File' }) {
  const [state, setState] = useState({ url: null, contentType: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetchBlob(path)
      .then((res) => {
        if (!cancelled) setState(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the file.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (state.url) URL.revokeObjectURL(state.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="flex min-h-[50vh] items-center justify-center">
        {loading && <Spinner size="lg" />}
        {!loading && error && <Alert variant="danger">{error}</Alert>}
        {!loading && !error && state.url && state.contentType?.startsWith('image/') && (
          <img src={state.url} alt={title} className="max-h-[70vh] w-full rounded-lg object-contain" />
        )}
        {!loading && !error && state.url && state.contentType === 'application/pdf' && (
          <iframe src={state.url} title={title} className="h-[70vh] w-full rounded-lg border border-neutral-200" />
        )}
      </div>
    </Modal>
  );
}

export default FileViewerModal;
