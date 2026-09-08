// Read-only smoke via browser-level CDP endpoint.
const port = Deno.args[0] ?? '9444';
const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let mid = 0;
const pending = new Map<number, (v: any) => void>();
let sessionId = '';
const events: any[] = [];
function send(method: string, params: Record<string, unknown> = {}, sid = sessionId) {
  return new Promise<any>((res) => {
    const i = ++mid; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params, sessionId: sid }));
  });
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result ?? m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')); });
const { targetId } = await send('Target.getTargets').then((r: any) => {
  const pages = r.targetInfos.filter((t: any) => t.type === 'page');
  return { targetId: pages[0].targetId };
});
const att = await send('Target.attachToTarget', { targetId, flatten: true });
sessionId = att.sessionId;
await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8790/#/selftest?auto=1' });
await new Promise((r) => setTimeout(r, 5000));
const dbg: any = await send('Runtime.evaluate', { expression: 'document.readyState + " | " + location.href + " | body:" + (document.body?.innerText ?? "NONE").slice(0, 120)', returnByValue: true });
console.log('page:', dbg?.result?.value);
const res: any = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__selftestResult ?? null)', returnByValue: true });
const errors: string[] = [], ext: string[] = [];
for (const m of events) {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('exc: ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 150));
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url;
    if (!u.startsWith('http://127.0.0.1:8790') && !u.startsWith('data:')) ext.push(u);
  }
}
console.log('selftest:', res?.result?.value ?? 'NO RESULT');
console.log('console errors:', errors.length, errors.slice(0, 2));
console.log('external requests:', ext.length, ext.slice(0, 2));
const parsed = JSON.parse(res?.result?.value ?? 'null');
const allGreen = parsed && parsed.allPass === true;
const ok = allGreen && errors.length === 0 && ext.length === 0;
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
ws.close(); Deno.exit(ok ? 0 : 1);
