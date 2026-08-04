import { useEffect, useRef, useState } from 'react';
import { Button, Icon, Input } from '../ui';
import { apiGet, apiPost, ApiError } from '../../api/client';

/**
 * Picks an image and hands back a URL.
 *
 * Two modes, chosen by what the server says is configured:
 *
 *   uploads enabled   file picker -> signed upload straight to Cloudinary -> URL
 *   not configured    the plain URL box this replaces
 *
 * The fallback is the point. Credentials are optional, and an image field that stopped working the
 * moment they were missing would be worse than one that asks for a link — every admin form using
 * this keeps working before anyone has a Cloudinary account.
 *
 * The file never passes through our API. The browser posts it to Cloudinary directly with a
 * short-lived signature, so no image bytes land on the container's ephemeral disk.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

// Fetched once per page rather than per field — a form with three image fields would otherwise ask
// the same question three times.
let configPromise = null;

function loadUploadConfig() {
  if (!configPromise) {
    configPromise = apiGet('/api/uploads/config')
      .then((res) => res.uploadsEnabled)
      // A failure here must not break the form: fall back to URL entry, which always works.
      .catch(() => false);
  }

  return configPromise;
}

function ImageUploadField({ label, value, onChange, purpose, hint, error }) {
  const [uploadsEnabled, setUploadsEnabled] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
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

  const handleFile = async (file) => {
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Pick a JPEG, PNG, WebP or AVIF image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const { upload } = await apiPost('/api/uploads/signature', { purpose });

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', upload.apiKey);
      form.append('timestamp', upload.timestamp);
      form.append('signature', upload.signature);
      form.append('folder', upload.folder);

      // Straight to Cloudinary — deliberately NOT through our own client wrapper, which would
      // attach our Authorization header to a third-party request.
      const res = await fetch(upload.uploadUrl, { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Cloudinary rejected the upload');
      }

      onChange(data.secure_url);
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : err.message || 'Upload failed. Try again, or paste a URL.'
      );
    } finally {
      setUploading(false);
      // Reset so picking the same file twice still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        error={error || uploadError}
        hint={
          error || uploadError
            ? undefined
            : hint ?? (uploadsEnabled ? 'Upload an image, or paste an https URL' : 'Paste an https image URL')
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {uploadsEnabled && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              {value ? 'Replace image' : 'Upload image'}
            </Button>
          </>
        )}

        {value && (
          <>
            {/* A thumbnail rather than a "saved" tick: the only way to know the URL points at the
                right picture is to look at it. */}
            <img
              src={value}
              alt=""
              aria-hidden="true"
              className="h-10 w-16 rounded object-cover ring-1 ring-neutral-200"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => onChange('')}>
              <Icon name="x" size={13} />
              Remove
            </Button>
          </>
        )}
      </div>

      {uploadsEnabled === false && (
        <p className="text-[12px] text-neutral-500">
          Direct upload is off — set the Cloudinary credentials on the server to enable it.
        </p>
      )}
    </div>
  );
}

export default ImageUploadField;
