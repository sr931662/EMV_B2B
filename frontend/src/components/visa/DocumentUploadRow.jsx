import { useRef, useState } from 'react';
import { Badge, Button, useToast } from '../ui';
import FileViewerModal from '../shared/FileViewerModal';
import { apiUpload, ApiError } from '../../api/client';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/** One row in a passenger's document checklist — upload, replace, or view. */
function DocumentUploadRow({ visaRequestId, passengerId, doc, upload, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const { showToast } = useToast();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showToast({ variant: 'danger', message: 'Only JPG, PNG, or PDF files are accepted.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast({ variant: 'danger', message: 'File must be 5MB or smaller.' });
      return;
    }

    const formData = new FormData();
    formData.append('documentName', doc.documentName);
    formData.append('document', file);

    setUploading(true);
    try {
      await apiUpload(`/api/visa-requests/${visaRequestId}/passengers/${passengerId}/documents`, formData);
      showToast({ variant: 'success', message: `${doc.documentName} uploaded.` });
      onUploaded();
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Upload failed. Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={upload ? 'text-success-600' : 'text-neutral-300'}>{upload ? '✓' : '○'}</span>
        <span className="text-sm text-neutral-900">{doc.documentName}</span>
        <Badge variant={doc.isMandatory ? 'warning' : 'neutral'}>
          {doc.isMandatory ? 'Mandatory' : 'Optional'}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {upload && (
          <Button variant="outline" size="sm" onClick={() => setViewerOpen(true)}>
            View
          </Button>
        )}
        <Button variant="outline" size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
          {upload ? 'Replace' : 'Upload'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {upload && (
        <FileViewerModal
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          path={`/api/visa-requests/${visaRequestId}/passengers/${passengerId}/documents/${upload.id}/file`}
          title={doc.documentName}
        />
      )}
    </div>
  );
}

export default DocumentUploadRow;
