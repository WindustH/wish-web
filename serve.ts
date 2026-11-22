#!/usr/bin/env node
// Static + API-proxy server for wish-web (hardened per decisions 23 / task 7).
//   · compiled static files from ./dist (build with ./pnpmw build)
//   · /api/* → wish (WISH_UPSTREAM; default http://127.0.0.1:9780)
//   · server-side bearer injection: WISH_HTTP_TOKEN
// Hardening:
//   · explicit Host allowlist — DNS rebinding / foreign-Host requests
//     are rejected BEFORE any proxying or token injection;
//   · cross-origin mutations (Origin / Sec-Fetch-Site) rejected 403;
//   · upstream base path preserved; http/https only (others rejected);
//   · client disconnect destroys the upstream request (SSE release);
//   · errors never leak stack traces to clients.
// Usage: node serve.ts   (PORT=8790 by default)
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8790);
const LISTEN_HOST = process.env.LISTEN_HOST || '127.0.0.1';
const sshMode = process.env.WISH_SSH_CLIENT === '1';
if (sshMode && (!['127.0.0.1', '::1'].includes(LISTEN_HOST) || process.env.ALLOWED_HOSTS?.trim()))
  throw new Error('WISH_SSH_CLIENT requires a loopback LISTEN_HOST and no extra ALLOWED_HOSTS');
const ssh = sshMode ? await import('./serve-ssh.ts') : undefined;
const ROOT = fileURLToPath(new URL('./dist', import.meta.url));
// Missing builds are a startup error, not an apparently healthy empty server.
await stat(join(ROOT, 'index.html'));

const BACKENDS = [
  {
    prefix: '/api',
    base: (ssh?.apiUrl.origin || process.env.WISH_UPSTREAM || 'http://127.0.0.1:9780').replace(/\/+$/, '') + '/api',
    token: ssh ? '' : process.env.WISH_HTTP_TOKEN || '',
  },
].map((backend) => {
  const url = new URL(backend.base);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`serve.ts: unsupported ${backend.prefix} protocol ${url.protocol} (http/https only)`);
  }
  return { ...backend, url, path: url.pathname.replace(/\/+$/, '') };
});
type Backend = (typeof BACKENDS)[number];

// Loopback by default; LAN access explicitly adds trusted HTTP authorities.
const HOSTS = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
  `[::1]:${PORT}`,
  ...(PORT === 80 ? ['127.0.0.1', 'localhost', '[::1]'] : []),
  ...(process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
]);
const MUTATION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function reject(res: ServerResponse, status: number, why: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: 'rejected', detail: why }));
}

// Labels come only from successful authenticated opens. In SSH mode each one keeps
// the exact session agent, never the credentials of another connected browser.
const views = new Map<string, { agent: ReturnType<NonNullable<typeof ssh>['proxyAgent']>; until: number }>();
ssh?.closedAgents.addEventListener('close', (event) => {
  for (const [label, view] of views) if (view.agent === (event as CustomEvent).detail) views.delete(label);
});
const viewLabel = (host: string) => /^(ws-[a-f0-9]{32})\./.exec(host)?.[1];
const server = createServer(async (req, res) => {
  try {
    // ── boundary checks (before any proxying / token injection) ──────────
    const host = String(req.headers.host || '').toLowerCase();
    if (req.headers['x-wish-site-hop']) return reject(res, 403, 'recursive website preview');
    if (viewLabel(host))
      return proxyApi(req, res, new URL(req.url || '/', 'http://preview.invalid'), BACKENDS[0]!, host);
    if (!HOSTS.has(host)) return reject(res, 421, 'unexpected host');

    const origin = req.headers.origin ? String(req.headers.origin) : null;
    const fetchSite = req.headers['sec-fetch-site'] ? String(req.headers['sec-fetch-site']) : null;
    if (MUTATION.has(req.method ?? '')) {
      if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
        return reject(res, 403, 'cross-origin mutation');
      if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
        return reject(res, 403, `cross-site mutation (${fetchSite})`);
      }
    }

    const url = new URL(req.url ?? '/', `http://${host}`);
    if (ssh && url.pathname.startsWith('/ssh/')) return await ssh.handle(req, res, url.pathname);
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    const backend = BACKENDS.find((b) => url.pathname === b.prefix || url.pathname.startsWith(b.prefix + '/'));
    if (backend) return proxyApi(req, res, url, backend);

    // ── static ────────────────────────────────────────────────────────────
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return reject(res, 400, 'invalid path encoding');
    }
    let path = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '') path = '/index.html';
    const file = join(ROOT, path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    try {
      const st = await stat(file);
      if (st.isDirectory()) throw new Error('dir');
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      return res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      // SPA-ish fallback for unknown non-asset paths → index
      if (!extname(path)) {
        const index = await readFile(join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : index);
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
  } catch (err) {
    console.error('[serve]', (err as Error | undefined)?.message || err); // server-side log only
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
    } else {
      res.destroy();
    }
  }
});

function proxyApi(req: IncomingMessage, res: ServerResponse, url: URL, backend: Backend, previewHost?: string): void {
  const label = previewHost && viewLabel(previewHost);
  const view = label ? views.get(label) : undefined;
  if (previewHost && (!view || view.until < Date.now())) return reject(res, 410, 'Website preview expired');
  const agent = view?.agent ?? ssh?.proxyAgent(req);
  if (ssh && !agent) return reject(res, 401, 'SSH login required');
  const up = backend.url;
  const target = previewHost
    ? url.pathname + url.search
    : backend.path + url.pathname.slice(backend.prefix.length) + url.search;
  const headers: OutgoingHttpHeaders = { ...req.headers, host: previewHost || up.host };
  delete headers['accept-encoding']; // avoid compressed SSE buffering
  if (ssh && !previewHost) delete headers.cookie;
  delete headers.referer;
  if (!previewHost) delete headers.origin;
  delete headers['sec-fetch-site'];
  delete headers['sec-fetch-mode'];
  if (!previewHost) delete headers['sec-fetch-dest'];
  if (previewHost) delete headers.authorization;
  else if (backend.token) headers.authorization = `Bearer ${backend.token}`;

  const doRequest = up.protocol === 'https:' ? httpsRequest : httpRequest;
  const prox = doRequest(
    {
      agent,
      hostname: up.hostname,
      port: up.port || (up.protocol === 'https:' ? 443 : 80),
      path: target,
      method: req.method,
      headers,
    },
    (pr) => {
      const h = { ...pr.headers };
      if (
        !previewHost &&
        req.method === 'POST' &&
        /^\/api\/sessions\/[^/]+\/blobs\/[a-f0-9]{64}\/website$/.test(url.pathname) &&
        pr.statusCode === 200
      ) {
        const key = h['x-wish-site'];
        if (typeof key === 'string' && /^ws-[a-f0-9]{32}$/.test(key)) {
          for (const [id, view] of views) if (view.until < Date.now()) views.delete(id);
          views.set(key, { agent, until: Date.now() + 3600000 });
        }
      }
      if (!previewHost && req.method === 'DELETE' && pr.statusCode === 204) {
        const closed = /^\/api\/sessions\/[^/]+\/blobs\/[a-f0-9]{64}\/website\/(ws-[a-f0-9]{32})$/.exec(
          url.pathname,
        )?.[1];
        if (closed && views.get(closed)?.agent === agent) views.delete(closed);
      }
      if (ssh && !previewHost) delete h['set-cookie'];
      res.writeHead(pr.statusCode || 502, h);
      pr.pipe(res); // streams SSE frames unbuffered
    },
  );

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

// A dedicated unbuffered tunnel for the authenticated, single-use PTY ticket.
server.on('upgrade', (req, socket, head) => {
  const refuse = (status: number) => socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
  const host = String(req.headers.host || '').toLowerCase();
  const label = viewLabel(host),
    view = label ? views.get(label) : undefined;
  if (req.headers['x-wish-site-hop'] || (label ? !view || view.until < Date.now() : !HOSTS.has(host)))
    return refuse(421);
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (
    (origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
    (site && site !== 'same-origin' && site !== 'none')
  )
    return refuse(403);
  let url: URL;
  try {
    url = new URL(req.url || '/', `http://${host}`);
  } catch {
    return refuse(400);
  }
  if (!view && !/^\/api\/sessions\/[^/]+\/(?:terminal|browser)\/socket$/.test(url.pathname)) return refuse(404);
  const backend = view ? BACKENDS[0] : BACKENDS.find((item) => url.pathname.startsWith(item.prefix + '/'));
  if (!backend) return refuse(404);
  const agent = view?.agent ?? ssh?.proxyAgent(req);
  if (ssh && !agent) return refuse(401);
  const headers = { ...req.headers, host: view ? host : backend.url.host };
  if (ssh && !view) delete headers.cookie;
  if (!view) delete headers.origin;
  delete headers['sec-fetch-site'];
  const request = (backend.url.protocol === 'https:' ? httpsRequest : httpRequest)({
    agent,
    hostname: backend.url.hostname,
    port: backend.url.port || (backend.url.protocol === 'https:' ? 443 : 80),
    path: view ? url.pathname + url.search : backend.path + url.pathname.slice(backend.prefix.length) + url.search,
    headers,
  });
  const upgradeTimeout = setTimeout(() => request.destroy(), 10000);
  request.once('close', () => clearTimeout(upgradeTimeout));
  if (socket instanceof Socket) socket.setNoDelay(true);
  request.on('upgrade', (response, upstream, upstreamHead) => {
    clearTimeout(upgradeTimeout);
    upstream.setTimeout(0);
    upstream.setNoDelay(true);
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
        .flatMap(([key, value]) =>
          value == null ? [] : (Array.isArray(value) ? value : [value]).map((item) => `${key}: ${item}`),
        )
        .join('\r\n')}\r\n\r\n`,
    );
    if (head.length) upstream.write(head);
    if (upstreamHead.length) socket.write(upstreamHead);
    socket.pipe(upstream);
    upstream.pipe(socket);
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  request.on('response', (response) => {
    response.resume();
    refuse(response.statusCode || 502);
  });
  request.on('error', () => refuse(502));
  socket.on('close', () => request.destroy());
  socket.on('error', () => request.destroy());
  request.end();
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`wish-web listening on ${LISTEN_HOST}:${PORT}; wish API routes enabled`);
});
