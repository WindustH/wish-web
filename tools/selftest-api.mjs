// Headless API-level selftest (no browser): verifies the endpoint surface
// the UI depends on, through the same reverse proxy serve.mjs exposes.
// Usage: node tools/selftest-api.mjs [baseUrl]   (default http://127.0.0.1:8790)
const BASE = process.argv[2] || 'http://127.0.0.1:8790';
const A = `${BASE}/wishd-api`;
let pass = 0, fail = 0;
const key = 'api-selftest-' + Date.now().toString(36).padEnd(16, '0');

async function check(name, fn) {
  try { const detail = await fn(); console.log(`PASS  ${name}${detail ? '  — ' + detail : ''}`); pass++; }
  catch (err) { console.log(`FAIL  ${name}  — ${err.message}`); fail++; }
}
const j = async (url, opts) => {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${body.detail || r.statusText}`);
  return body;
};

await check('GET /version', async () => {
  const v = await j(`${A}/version`); return `${v.name} ${v.version}`;
});
await check('GET /sessions', async () => {
  const p = await j(`${A}/sessions?limit=2`);
  if (!Array.isArray(p.items)) throw new Error('no items');
  return `${p.items.length} rows`;
});
await check('GET /sync/events SSE first frame', async () => {
  const r = await fetch(`${A}/sync/events`, { headers: { accept: 'text/event-stream' } });
  const reader = r.body.getReader();
  const t0 = Date.now();
  const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
  const read = (async () => {
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended before event');
      const txt = dec.decode(value);
      if (/^event: /m.test(txt)) {
        const ev = txt.match(/^event: (.+)$/m)[1];
        await reader.cancel();
        return `${ev} @${Date.now() - t0}ms`;
      }
    }
  })();
  return await Promise.race([read, timer]);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
