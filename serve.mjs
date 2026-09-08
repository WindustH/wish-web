#!/usr/bin/env node
// Static + API-proxy server for wish-web (hardened per decisions 23 / task 7).
//   · static files from ./webroot (the app itself is build-free)
//   · /wishd-api/* → wishd (default http://127.0.0.1:9780), streamed so SSE works
//   · optional bearer injection: WISHD_TOKEN env (when wishd auth mode = bearer)
// Hardening:
//   · Host allowlist (loopback only) — DNS rebinding / foreign-Host requests
//     are rejected BEFORE any proxying or token injection;
//   · cross-origin mutations (Origin / Sec-Fetch-Site) rejected 403;
//   · upstream base path preserved; http/https only (others rejected);
//   · client disconnect destroys the upstream request (SSE release);
//   · errors never leak stack traces to clients.
// Usage: node serve.mjs   (PORT=8790 by default)
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8790);
const UPSTREAM = process.env.WISHD_UPSTREAM || 'http://127.0.0.1:9780';
const TOKEN = process.env.WISHD_TOKEN || '';
const ROOT = fileURLToPath(new URL('./webroot', import.meta.url));

const up = new URL(UPSTREAM);
if (up.protocol !== 'http:' && up.protocol !== 'https:') {
  console.error(`serve.mjs: unsupported upstream protocol ${up.protocol} (http/https only)`);
  process.exit(2);
}
const UP_PATH = up.pathname.replace(/\/+$/, '');   // preserved base path ("" ok)

// Loopback single-user boundary: only these Host values may talk to us.
const HOSTS = new Set([
  `127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`,
  ...(PORT === 80 ? ['127.0.0.1', 'localhost', '[::1]'] : []),
]);
const SAME_ORIGIN = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
const MUTATION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

function reject(res, status, why) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: 'rejected', detail: why }));
}

const server = createServer(async (req, res) => {
  try {
    // ── boundary checks (before any proxying / token injection) ──────────
    const host = String(req.headers.host || '').toLowerCase();
    if (!HOSTS.has(host)) return reject(res, 421, 'unexpected host');

    const origin = req.headers.origin ? String(req.headers.origin) : null;
    const fetchSite = req.headers['sec-fetch-site'] ? String(req.headers['sec-fetch-site']) : null;
    if (MUTATION.has(req.method)) {
      if (origin && !SAME_ORIGIN.has(origin)) return reject(res, 403, 'cross-origin mutation');
      if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
        return reject(res, 403, `cross-site mutation (${fetchSite})`);
      }
    }

    const url = new URL(req.url, `http://${host}`);
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, upstream: UPSTREAM }));
    }
    if (url.pathname === '/wishd-api' || url.pathname.startsWith('/wishd-api/')) {
      return proxyApi(req, res, url);
    }

    // ── static ────────────────────────────────────────────────────────────
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '') path = '/index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    try {
      const st = await stat(file);
      if (st.isDirectory()) throw new Error('dir');
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      return res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      // SPA-ish fallback for unknown non-asset paths → index
      if (!extname(path)) {
        const index = await readFile(join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
        return res.end(index);
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
  } catch (err) {
    console.error('[serve]', err?.message || err);   // server-side log only
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
    } else {
      res.destroy();
    }
  }
});

function proxyApi(req, res, url) {
  const target = UP_PATH + url.pathname.replace(/^\/wishd-api/, '') + url.search;
  const headers = { ...req.headers, host: up.host };
  delete headers['accept-encoding'];            // avoid compressed SSE buffering
  delete headers.referer; delete headers.origin;
  delete headers['sec-fetch-site']; delete headers['sec-fetch-mode'];
  delete headers['sec-fetch-dest'];
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  const doRequest = up.protocol === 'https:' ? httpsRequest : httpRequest;
  const prox = doRequest(
    { hostname: up.hostname, port: up.port || (up.protocol === 'https:' ? 443 : 80),
      path: target, method: req.method, headers },
    (pr) => {
      const h = { ...pr.headers };
      res.writeHead(pr.statusCode || 502, h);
      pr.pipe(res);                              // streams SSE frames unbuffered
    });

  // Browser disconnected (SSE closed, tab killed) → release the upstream
  // connection immediately instead of pinning daemon streams.
  const killUpstream = () => prox.destroy();
  res.on('close', killUpstream);
  req.on('aborted', killUpstream);
  prox.on('error', (err) => {
    console.error('[serve:proxy]', err?.message || err);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream_unreachable', detail: String(err.message || 'unreachable') }));
    } else {
      res.destroy();
    }
  });
  req.pipe(prox);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`wish-web → http://127.0.0.1:${PORT}  (api proxy → ${UPSTREAM})`);
});
