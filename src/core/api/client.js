// HTTP client. DOM-free (fetch + AbortController only) so shells reuse it.
// All errors normalize to ApiError {status, code, title, detail, retryable}.
import { cfg } from '../config.js';

export class ApiError extends Error {
  constructor(status, code, title, detail, retryable) {
    // Server errors carry one message as both title and detail; say it once.
    const head = title || code || status;
    super(!detail || detail === head ? String(head) : `${head}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || String(status);
    this.title = title;
    this.detail = detail || '';
    this.retryable = Boolean(retryable);
  }
}

// One backend base URL; browsers resolve the relative default against their origin.
function createClient(initialBase) {
  let baseUrl = initialBase;
  let resolvedBase = null;
  const setBaseUrl = url => { baseUrl = url; resolvedBase = null; };
  const getBaseUrl = () => baseUrl;
  function absoluteBase() {
    if (resolvedBase) return resolvedBase;
    if (/^https?:\/\//i.test(baseUrl)) {
      resolvedBase = baseUrl.replace(/\/+$/, '');
    } else {
      const loc = globalThis.location;
      if (!loc?.origin) {
        throw new ApiError(0, 'base-url-missing', 'base-url-missing',
          `core used outside a browser must call setBaseUrl() with an absolute URL (got ${JSON.stringify(baseUrl)})`, false);
      }
      resolvedBase = new URL(baseUrl, loc.origin).href.replace(/\/+$/, '');
    }
    return resolvedBase;
  }
  const absUrl = path => absoluteBase() + path;
  const api = async (method, path, opts) => request(method, absUrl(path), opts);
  // Whether a URL addresses this backend, so it may carry the access token.
  const isApiUrl = url => {
    try { return new URL(String(url), globalThis.location?.href).href.startsWith(absoluteBase() + '/'); }
    catch { return false; }
  };
  return {
    setBaseUrl, getBaseUrl, absUrl, api, isApiUrl,
    get: (path, opts) => api('GET', path, opts),
    post: (path, body, opts) => api('POST', path, { ...opts, body }),
    patch: (path, body, opts) => api('PATCH', path, { ...opts, body }),
    put: (path, body, opts) => api('PUT', path, { ...opts, body }),
    del: (path, opts) => api('DELETE', path, opts),
  };
}

export const { get, post, patch, put, del, api, absUrl, getBaseUrl, setBaseUrl, isApiUrl } = createClient(cfg.api.baseUrl);

// A backend reached directly (not through the page's own proxy) needs its access
// token on every request; the proxy adds it server-side otherwise.
let accessToken = '';
export const setAccessToken = token => { accessToken = token || ''; };
export const authHeaders = () => accessToken ? { authorization: `Bearer ${accessToken}` } : {};
/** Whether loading this URL needs the token, which an <img> or <a> cannot send. */
export const needsAccessToken = url => !!accessToken && isApiUrl(url);

/** fetch() that adds the access token to requests for the backend, e.g. attachments. */
export function apiFetch(url, init = {}) {
  if (!accessToken || !isApiUrl(url)) return fetch(url, init);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}


async function problemFromBody(body, status) {
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    return new ApiError(status, status === 409 ? "state_conflict" : String(status), j.error?.message ?? j.title ?? "HTTP error", j.error?.message ?? j.detail ?? JSON.stringify(j), status >= 500);
  } catch { return null; }
}

async function request(method, target, { body, query, signal, headers, raw } = {}) {
  const url = new URL(target);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const h = { ...authHeaders(), ...(headers || {}) };
  if (body !== undefined && !raw) h['content-type'] = 'application/json';


  // A request that can never settle (sleep/wake, a proxy black hole) would
  // pin every busy flag behind it forever, so every call carries the
  // configured timeout alongside the caller's signal. A timeout surfaces as
  // a retryable network error; a caller abort stays a plain AbortError.
  const timeout = AbortSignal.timeout(cfg.api.requestTimeoutMs ?? 30_000);
  let res;
  try {
    res = await fetch(url, {
      method, headers: h,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (timeout.aborted) throw new ApiError(0, 'network', 'network', 'request timed out', true);
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'network', String(err?.message || err), true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw (await problemFromBody(text, res.status)) ||
      new ApiError(res.status, 'http', res.statusText, text.slice(0, 300), res.status >= 500);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}
