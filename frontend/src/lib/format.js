// Prisma Decimal fields (rawPrice, payment amount, ...) arrive over JSON as strings — Number()
// them before formatting rather than assuming a JS number.

export function formatCurrency(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Mirrors backend/src/controllers/packageController.js's own slug so the downloaded filename
 * matches what the server would have named it — the browser can't read the Content-Disposition
 * header cross-origin without the backend opting in via CORS `exposedHeaders`, so we build the
 * name ourselves instead of relying on it.
 */
export function slugify(text, fallback = 'package') {
  const slug = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** Splits a Text-block field (inclusions/exclusions, newline or bullet separated) into list items. */
export function splitTextBlock(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}
