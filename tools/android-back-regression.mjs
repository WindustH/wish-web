// Real Android Chrome edge gestures, not history.back() or a simulated browser history.
// Usage: node tools/android-back-regression.mjs http://host:8790 TAB_ID
// Open that Wish tab at /sessions first. The test opens settings but never changes configuration.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const base = process.argv[2], tabId = process.argv[3];
assert(base && tabId, 'Pass the Wish base URL and Chrome tab ID');
const adb = async (...args) => (await exec('adb', [...(process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []), ...args])).stdout.trim();
const port = await adb('forward', 'tcp:0', 'localabstract:chrome_devtools_remote');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(item => item.id === tabId && item.url.startsWith(base + '/'));
  assert(target, 'The requested Wish tab must exist');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let serial = 0; const pending = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data), request = pending.get(message.id);
    if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('Timed out: ' + method)); }, 5000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.onclose = () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('Chrome closed the test tab')); } pending.clear(); };
  const js = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, 'Page expression failed');
    return result.result.value;
  };
  const until = async (expression, label) => {
    for (let attempt = 0; attempt < 80; attempt++) { if (await js(expression)) return; await sleep(100); }
    throw Error(label + ': ' + await js('JSON.stringify({route:location.hash,visible:document.visibilityState,locks:document.body.style.cssText})'));
  };
  const tap = async (selector, text = '') => {
    const point = await js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert(point, `Missing control ${selector}`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const sizes = [...(await adb('shell', 'wm', 'size')).matchAll(/(\d+)x(\d+)/g)];
  const [width, height] = sizes.at(-1).slice(1).map(Number);
  const backGesture = async (right = false) => adb('shell', 'input', 'swipe', String(right ? width - 2 : 2), String(Math.round(height / 2)), String(Math.round(width * (right ? .55 : .45))), String(Math.round(height / 2)), '350');
  assert.equal(await js('document.visibilityState'), 'visible', 'Bring the Wish test tab to the foreground');
  assert.equal(await js('location.hash'), '#/sessions', 'Start on the Wish homepage');
  const rounds = [];
  for (let round = 0; round < 2; round++) {
    await tap('.app-menu-button');
    await until('!!document.querySelector("[role=menuitem]")', 'menu opens');
    await tap('[role=menuitem]', '设置');
    await until('location.hash==="#/settings" && !!document.querySelector(".settings-section")', 'settings opens');
    await tap('.settings-section', '账户');
    await until('location.hash==="#/settings?section=accounts" && !!document.querySelector(".mobile-settings-row")', 'account list opens');
    await tap('.mobile-settings-row');
    await until('!!document.querySelector(".account-editor")', 'account editor opens');
    await backGesture(round === 1);
    await until('!document.querySelector(".account-editor") && location.hash==="#/settings?section=accounts"', 'gesture closes account editor');
    await backGesture(round === 1);
    await until('location.hash==="#/settings"', 'gesture returns to settings categories');
    await backGesture(round === 1);
    await until('location.hash==="#/sessions"', 'gesture returns home');
    await backGesture(round === 1);
    await until('!!document.querySelector(".exit-confirmation")', 'gesture requests exit confirmation');
    const box = await js('(()=>{const r=document.querySelector(".exit-confirmation").getBoundingClientRect();return {width:r.width,height:r.height,viewport:innerWidth}})()');
    assert(box.width < box.viewport && box.height < 180, 'Exit confirmation must stay compact');
    await tap('.exit-confirmation button', '取消');
    await until('!document.querySelector(".modal-overlay") && document.body.style.pointerEvents!=="none"', 'cancel releases interaction locks');
    rounds.push({ edge: round ? 'right' : 'left', exitDialog: box });
  }
  await backGesture();
  await until('!!document.querySelector(".exit-confirmation")', 'exit can be requested again');
  await backGesture();
  await until('!document.querySelector(".exit-confirmation") && location.hash==="#/sessions"', 'system gesture cancels exit prompt');
  console.log(JSON.stringify({ ok: true, device: await adb('shell', 'getprop', 'ro.product.model'), rounds,
    checks: ['detail/category/home hierarchy', 'consecutive left and right system gestures', 'compact exit prompt', 'cancel and repeat without lock or tab closure'] }));
} finally {
  ws?.close();
  await adb('forward', '--remove', `tcp:${port}`);
}
