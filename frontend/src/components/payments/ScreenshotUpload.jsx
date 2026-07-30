import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/**
 * File picker for payment proof (screenshot or PDF receipt) — mirrors the backend's own
 * `uploadSingle` constraints (backend/src/middleware/upload.js) so a bad file is caught before
 * the round trip, not after. Shows a thumbnail for images, just the filename for PDFs.
 */
function ScreenshotUpload({ label = 'Payment screenshot', file, onChange, error, required }) {
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
    return undefined;
  }, [file]);

  const handleChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) {
      onChange(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setLocalError('Only JPG, PNG, or PDF files are accepted.');
      onChange(null);
      e.target.value = '';
      return;
    }
    if (selected.size > MAX_BYTES) {
      setLocalError('File must be 5MB or smaller.');
      onChange(null);
      e.target.value = '';
      return;
    }
    setLocalError(null);
    onChange(selected);
  };

  const displayError = error || localError;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </label>

      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3',
          displayError ? 'border-danger-400' : 'border-neutral-300'
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={handleChange}
          className="hidden"
        />
        {file ? (
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {previewUrl && <img src={previewUrl} alt="" className="h-10 w-10 rounded object-cover" />}
            <span className="truncate text-sm text-neutral-700">{file.name}</span>
          </div>
        ) : (
          <span className="text-sm text-neutral-400">JPG, PNG, or PDF, up to 5MB</span>
        )}
      </div>
      {displayError && <p className="text-sm text-danger-600">{displayError}</p>}
    </div>
  );
}

export default ScreenshotUpload;
