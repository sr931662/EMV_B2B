// Thin fetch wrapper shared by every API call in the app. Deliberately not React-Query/SWR —
// the brief asked for nothing heavier than this. See frontend/API_SURFACE.md for the exact
// endpoints this is allowed to call.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'b2b_emv_token';

// --- token storage -----------------------------------------------------------------------
// In-memory + localStorage: `token` is read fresh from localStorage on every request rather
// than cached in a module variable, so a login/logout in one browser tab is picked up by the
// next request from any other code path without needing a shared in-memory singleton.

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // localStorage can throw in some privacy modes — treat as logged out
  }
}

function setStoredToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore — worst case the session doesn't survive a refresh, it still works this tab.
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // no-op
  }
}

// --- error shape ---------------------------------------------------------------------------
// A real Error subclass (not a plain object) so `catch` blocks, error boundaries, and console
// logging all behave normally, while still exposing exactly the {status, message, details}
// shape the brief asked for via properties.
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details; // [{field, message}] on validation failures — see errorHandler.js
  }
}

/**
 * Runs on any 401: the token is stale/expired/revoked (see authMiddleware's live re-check on
 * the backend — archived users, password resets, and admin suspensions all invalidate a token
 * server-side without the client knowing until the next request). Clearing storage and doing a
 * full navigation is simpler and more robust for a foundation than trying to thread a
 * react-router redirect through a plain fetch wrapper, and guarantees every in-memory React
 * state (including AuthContext) resets cleanly.
 */
function handleUnauthorized() {
  clearStoredToken();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Core request function. `body` is JSON-encoded automatically unless `isMultipart` is set, in
 * which case `body` must already be a FormData instance and no Content-Type is set — the
 * browser must generate the multipart boundary itself.
 */
async function request(path, { method = 'GET', body, headers = {}, isMultipart = false } = {}) {
  const token = getStoredToken();
  const finalHeaders = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let fetchBody;
  if (isMultipart) {
    fetchBody = body;
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { method, headers: finalHeaders, body: fetchBody });
  const data = await parseBody(res);

  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, data?.error || 'Session expired, please log in again', data?.details);
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || res.statusText || 'Request failed', data?.details);
  }

  return data;
}

const apiGet = (path, opts) => request(path, { ...opts, method: 'GET' });
const apiPost = (path, body, opts) => request(path, { ...opts, method: 'POST', body });
const apiPatch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body });
const apiDelete = (path, opts) => request(path, { ...opts, method: 'DELETE' });

/** Multipart helper for payment screenshots / visa documents. `formData` is a FormData you built. */
const apiUpload = (path, formData, { method = 'POST' } = {}) =>
  request(path, { method, body: formData, isMultipart: true });

/** Shared plumbing for both apiDownload (save-as) and apiFetchBlob (inline view): auth header,
 * the same 401/error handling as every other call, then hands back the raw Response. */
async function fetchAuthed(path) {
  const token = getStoredToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { headers });

  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, 'Session expired, please log in again');
  }

  if (!res.ok) {
    const data = await parseBody(res);
    throw new ApiError(res.status, data?.error || res.statusText || 'Request failed', data?.details);
  }

  return res;
}

/**
 * Fetches a binary response (PDFs, uploaded proof images) and triggers a normal browser download
 * via a throwaway <a download>. Reused by every "download the PDF" button rather than each screen
 * re-implementing blob plumbing.
 */
async function apiDownload(path, { filename } = {}) {
  const res = await fetchAuthed(path);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const finalName = filename || match?.[1] || 'download';

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Fetches a binary response for INLINE viewing (payment proof screenshots) rather than a
 * save-as download — hands back a blob URL + content type so the caller can drop it into an
 * <img>/<iframe> and is responsible for calling URL.revokeObjectURL when done with it.
 */
async function apiFetchBlob(path) {
  const res = await fetchAuthed(path);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), contentType: res.headers.get('Content-Type') || blob.type };
}

export {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  apiUpload,
  apiDownload,
  apiFetchBlob,
  ApiError,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
};
