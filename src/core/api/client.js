// HTTP client. DOM-free (fetch + AbortController only) so shells reuse it.
// All errors normalize to ApiError {status, code, title, detail, retryable}.
import { cfg } from '../config.js';
import { idemKey } from '../util/fmt.js';

export class ApiError extends Error {
  constructor(status, code, title, detail, retryable) {
    super(`${title || code || status}: ${detail || ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || String(status);
    this.title = title;
    this.detail = detail || '';
    this.retryable = Boolean(retryable);
  }
}

// Each backend owns its base URL. Shells can set the two absolute bases
// independently; browsers resolve the relative defaults against their origin.
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
  return {
    setBaseUrl, getBaseUrl, absUrl, api,
    get: (path, opts) => api('GET', path, opts),
    post: (path, body, opts) => api('POST', path, { ...opts, body }),
    patch: (path, body, opts) => api('PATCH', path, { ...opts, body }),
    put: (path, body, opts) => api('PUT', path, { ...opts, body }),
    del: (path, opts) => api('DELETE', path, opts),
  };
}

export const { get, post, patch, put, del, api, absUrl, getBaseUrl, setBaseUrl } = createClient(cfg.api.baseUrl);
export const providerd = createClient(cfg.api.providerdBaseUrl);

async function problemFromBody(body, status) {
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    return new ApiError(j.status ?? status, j.code, j.title, j.detail, j.retryable);
  } catch { return null; }
}

async function request(method, target, { body, query, signal, headers, raw } = {}) {
  const url = new URL(target);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const h = { ...(headers || {}) };
  if (body !== undefined && !raw) h['content-type'] = 'application/json';
  // Mutations need an idempotency key (≥16 printable ASCII bytes).
  if (method !== 'GET' && method !== 'HEAD') h['idempotency-key'] ||= idemKey(cfg.api.idempotencyKeyLen);

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
