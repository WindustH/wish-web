#!/usr/bin/env node
// Minimal static + API-proxy server for wish-web.
//   · static files from ./webroot (the app itself is build-free)
//   · /wishd-api/* → wishd (default http://127.0.0.1:9780), streamed so SSE works
//   · optional bearer injection: WISHD_TOKEN env (when wishd auth mode = bearer)
// Usage: node serve.mjs   (PORT=8790 by default)
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8790);
const UPSTREAM = process.env.WISHD_UPSTREAM || 'http://127.0.0.1:9780';
const TOKEN = process.env.WISHD_TOKEN || '';
const ROOT = fileURLToPath(new URL('./webroot', import.meta.url));
const up = new URL(UPSTREAM);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, upstream: UPSTREAM }));
    }
    if (url.pathname.startsWith('/wishd-api/')) return proxyApi(req, res, url);

    // static
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
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err?.stack || err));
  }
});

function proxyApi(req, res, url) {
  const target = url.pathname.replace(/^\/wishd-api/, '') + url.search;
  const headers = { ...req.headers, host: up.host };
  delete headers['accept-encoding'];            // avoid compressed SSE buffering
  delete headers.referer; delete headers.origin;
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  const prox = httpRequest(
    { hostname: up.hostname, port: up.port, path: target,
      method: req.method, headers },
    (pr) => {
      res.writeHead(pr.statusCode || 502, pr.headers);
      pr.pipe(res);                              // streams SSE frames unbuffered
    });
  prox.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream_unreachable', detail: String(err.message) }));
  });
  req.pipe(prox);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`wish-web → http://127.0.0.1:${PORT}  (api proxy → ${UPSTREAM})`);
});
