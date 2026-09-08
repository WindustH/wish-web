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

// Base URL handling must stay DOM-free so shells (Node / Tauri / Capacitor)
// can import and use core. Root-relative bases are resolved against the
// browser origin lazily (never at import time); non-browser hosts must inject
// an absolute base via setBaseUrl() before the first call.
let baseUrl = cfg.api.baseUrl;
let resolvedBase = null;

export function setBaseUrl(url) { baseUrl = url; resolvedBase = null; }
export function getBaseUrl() { return baseUrl; }

function absoluteBase() {
  if (resolvedBase) return resolvedBase;
  if (/^https?:\/\//i.test(baseUrl)) {
    resolvedBase = baseUrl.replace(/\/+$/, '');
  } else {
    const loc = typeof globalThis !== 'undefined' ? globalThis.location : null;
    if (loc && loc.origin) {
      resolvedBase = new URL(baseUrl, loc.origin).href.replace(/\/+$/, '');
    } else {
      throw new ApiError(0, 'base-url-missing', 'base-url-missing',
        `core used outside a browser must call setBaseUrl() with an absolute URL (got ${JSON.stringify(baseUrl)})`, false);
    }
  }
  return resolvedBase;
}

// Absolute URL for a given API path (fetch/SSE both need this in shells).
export const absUrl = (path) => absoluteBase() + path;

async function problemFromBody(body, status) {
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    return new ApiError(j.status ?? status, j.code, j.title, j.detail, j.retryable);
  } catch { return null; }
}

export async function api(method, path, { body, query, signal, headers, raw } = {}) {
  const url = new URL(absUrl(path));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const h = { ...(headers || {}) };
  if (body !== undefined && !raw) h['content-type'] = 'application/json';
  // Mutations need an idempotency key (≥16 printable ASCII bytes).
  if (method !== 'GET' && method !== 'HEAD') h['idempotency-key'] ||= idemKey(cfg.api.idempotencyKeyLen);

  let res;
  try {
    res = await fetch(url, {
      method, headers: h, signal,
      body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
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

export const get = (path, opts) => api('GET', path, opts);
export const post = (path, body, opts) => api('POST', path, { ...opts, body });
export const patch = (path, body, opts) => api('PATCH', path, { ...opts, body });
export const put = (path, body, opts) => api('PUT', path, { ...opts, body });
export const del = (path, opts) => api('DELETE', path, opts);
