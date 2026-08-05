import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '../ui';
import { apiGet, apiPost, apiDelete, ApiError } from '../../api/client';

/**
 * A gallery: several images, each either uploaded to Cloudinary or pasted as a URL.
 *
 * Shares its reasoning with ImageUploadField — the single-image version of the same thing — but
 * kept separate because a list needs add/remove/reorder semantics that would clutter the single
 * field. Both fall back to plain URL entry when Cloudinary is not configured, so the form works
 * before anyone has an account.
 *
 * Files go straight from the browser to Cloudinary; only the resulting URL passes through here.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

let configPromise = null;

function loadUploadConfig() {
  if (!configPromise) {
    configPromise = apiGet('/api/uploads/config')
      .then((res) => res.uploadsEnabled)
      .catch(() => false);
  }

  return configPromise;
}

function RepeatableUrlList({
  label,
  values,
  onChange,
  placeholder = 'https://...',
  purpose = 'packageGallery',
  ownerType,
  ownerId,
}) {
  const [uploadsEnabled, setUploadsEnabled] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  // publicId per URL, for the rows this component uploaded. A pasted URL has no entry and is
  // therefore never destroyed when removed — only detached.
  const ownedRef = useRef(new Map());
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    loadUploadConfig().then((enabled) => {
      if (!cancelled) setUploadsEnabled(enabled);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setAt = (i, v) => onChange(values.map((x, idx) => (idx === i ? v : x)));
  const addRow = () => onChange([...values, '']);

  const removeRow = async (i) => {
    const url = values[i];
    const publicId = ownedRef.current.get(url);

    onChange(values.filter((_, idx) => idx !== i));

    if (publicId) {
      ownedRef.current.delete(url);
      // Housekeeping only — the row is already gone from the form either way.
      await apiDelete(`/api/uploads/${publicId}`).catch(() => {});
    }
  };

  /** Multiple files at once: picking eight photos one at a time is the wrong shape for a gallery. */
  const handleFiles = async (files) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    const rejected = picked.filter((f) => !ACCEPTED.includes(f.type) || f.size > MAX_BYTES);
    const usable = picked.filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_BYTES);

    setUploading(true);
    setError(rejected.length ? `${rejected.length} file(s) skipped — must be an image under 8 MB.` : null);

    const added = [];

    try {
      for (const file of usable) {
        const { upload } = await apiPost('/api/uploads/signature', { purpose });

        const form = new FormData();
        form.append('file', file);
        form.append('api_key', upload.apiKey);
        form.append('timestamp', upload.timestamp);
        form.append('signature', upload.signature);
        form.append('folder', upload.folder);

        const res = await fetch(upload.uploadUrl, { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error?.message || 'Cloudinary rejected the upload');

        await apiPost('/api/uploads/register', {
          publicId: data.public_id,
          url: data.secure_url,
          kind: 'IMAGE',
          visibility: 'PUBLIC',
          folder: upload.folder,
          format: data.format,
          bytes: data.bytes,
          width: data.width,
          height: data.height,
          originalFilename: data.original_filename,
          purpose,
          ownerType,
          ownerId,
        });

        ownedRef.current.set(data.secure_url, data.public_id);
        added.push(data.secure_url);
      }

      // One state update at the end rather than per file, so a half-finished batch does not
      // re-render the list eight times.
      if (added.length) onChange([...values.filter(Boolean), ...added]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      <p className="text-xs text-neutral-400">
        {uploadsEnabled
          ? 'Upload images, or paste URLs. Uploads go straight to Cloudinary.'
          : 'Paste image URLs — set the Cloudinary credentials to enable direct upload.'}
      </p>

      {error && <p className="text-xs text-danger-600">{error}</p>}

      {values.map((v, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="flex items-center gap-2">
          {v && (
            <img
              src={v}
              alt=""
              aria-hidden="true"
              className="h-9 w-14 shrink-0 rounded object-cover ring-1 ring-neutral-200"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          )}
          <input
            value={v}
            onChange={(e) => setAt(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-sm font-medium text-danger-600 hover:text-danger-700"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {uploadsEnabled && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED.join(',')}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              Upload images
            </Button>
          </>
        )}
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + Add image URL
        </Button>
      </div>
    </div>
  );
}

export default RepeatableUrlList;
