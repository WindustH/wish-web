// Which Wish server this browser talks to. By default it is the server that
// served the page, reached through its /api proxy, which adds the access token
// itself. Connecting to another server stores its address and token here, and
// requests then go to it directly. Signing out forgets both.
import { tryPlatform } from '../platform/index.ts';
import { cfg } from './config.ts';
import { setAccessToken, setBaseUrl } from './api/client.ts';
import { clearCached } from './util/responseCache.ts';
import { tr } from './i18n/tr.ts';

type Connection = { baseUrl: string; token: string };
const CONNECTION = 'connection';
const SIGNED_OUT = 'connection.signedOut';
const LAST_ADDRESS = 'connection.lastAddress';
const storage = () => tryPlatform('storage');

function read(): Connection | null {
  try {
    const value = JSON.parse(storage()?.get(CONNECTION) || 'null');
    return value && typeof value.baseUrl === 'string' ? { baseUrl: value.baseUrl, token: String(value.token ?? '') } : null;
  } catch { return null; }
}

/** Points the API client at the saved server. Call once, before any request. */
export function applyConnection() {
  const saved = read();
  if (!saved) return;
  setBaseUrl(saved.baseUrl);
  setAccessToken(saved.token);
}

export const isSignedOut = () => storage()?.get(SIGNED_OUT) === '1';
/** The address last connected to, to fill the sign-in form again. */
export const lastAddress = () => storage()?.get(LAST_ADDRESS) ?? '';
/** Host of the server in use, for labels. */
export function serverName() {
  const saved = read();
  try { return saved ? new URL(saved.baseUrl).host : globalThis.location.host; } catch { return globalThis.location.host; }
}

/** The API base for what the user typed: an origin, optionally with a path; empty means this page's server. */
export function apiBaseFor(address: string) {
  const text = address.trim();
  if (!text) return cfg.api.baseUrl;
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `${location.protocol}//${text}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
  const path = url.pathname.replace(/\/+$/, '');
  return url.origin + (path.endsWith('/api') ? path : `${path}/api`);
}

const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

/** Clearing local preferences is not signing out: returns a function that restores the connection. */
export function keepConnection() {
  const store = storage();
  const saved = [CONNECTION, SIGNED_OUT, LAST_ADDRESS].map(key => [key, store?.get(key)] as const);
  return () => { for (const [key, value] of saved) if (value != null) store?.set(key, value); };
}

/** Checks that a Wish server answers at this address with this token; throws a readable error otherwise. */
export async function checkConnection(address: string, token: string) {
  let base: string;
  try { base = new URL(apiBaseFor(address), location.href).href.replace(/\/+$/, ''); }
  catch { throw new Error(tr('请输入有效的服务器地址，例如 https://wish.example.com。', 'Enter a valid server address, such as https://wish.example.com.')); }
  const target = new URL(base);
  if (location.protocol === 'https:' && target.protocol === 'http:' && !loopback(target.host.replace(/:\d+$/, ''))) {
    throw new Error(tr('此页面通过 HTTPS 打开，浏览器不允许它连接 HTTP 地址。请使用 HTTPS 地址。', 'This page was opened over HTTPS, so the browser will not let it connect to an HTTP address. Use an HTTPS address.'));
  }
  let response: Response;
  try {
    response = await fetch(`${base}/version`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(target.origin === location.origin
      ? tr('无法连接到服务器。请确认服务器正在运行。', 'Could not reach the server. Check that it is running.')
      : tr('无法连接到这个地址。请确认地址正确、服务器正在运行，并且它设置了访问令牌：未设置令牌的 Wish 服务器不接受来自其他网页的连接。',
        'Could not reach this address. Check that it is correct, that the server is running, and that it requires an access token: a Wish server without one does not accept connections from other web pages.'));
  }
  if (response.status === 401) {
    throw new Error(token ? tr('访问令牌不正确。', 'The access token is not correct.') : tr('这个服务器需要访问令牌。', 'This server requires an access token.'));
  }
  const identity = response.ok ? await response.json().catch(() => null) : null;
  if (identity?.name !== 'wish') {
    throw new Error(tr(`这个地址上没有找到 Wish 服务器（HTTP ${response.status}）。`, `No Wish server was found at this address (HTTP ${response.status}).`));
  }
}

/** Saves a checked connection and restarts the app on it. */
export function connect(address: string, token: string) {
  const baseUrl = apiBaseFor(address);
  const store = storage();
  if (baseUrl === cfg.api.baseUrl && !token) store?.remove(CONNECTION);
  else store?.set(CONNECTION, JSON.stringify({ baseUrl, token }));
  store?.set(LAST_ADDRESS, address.trim());
  store?.remove(SIGNED_OUT);
  location.replace(location.pathname + location.search);
}

/** Forgets the server and its token, drops cached responses and shows the sign-in page. */
export async function signOut() {
  const store = storage();
  store?.remove(CONNECTION);
  store?.set(SIGNED_OUT, '1');
  try { localStorage.removeItem('wish.providerGate.ready'); } catch { /* storage unavailable */ }
  await clearCached();
  location.replace(location.pathname + location.search);
}
