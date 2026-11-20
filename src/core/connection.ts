import { isNativeApp, nativeHttp, nativeSession, nativeLogout } from '../platform/native.ts';
import { createAbortScope } from './util/abortScope.ts';
// Which Wish server this browser talks to. By default it is the server that
// served the page, reached through its /api proxy, which adds the access token
// itself. Connecting to another server stores its address and token here, and
// requests then go to it directly. Saved accounts survive sign-out.
import { tryPlatform } from '../platform/index.ts';
import { cfg } from './config.ts';
import { getConnectionScope, setAccessToken, setBaseUrl } from './api/client.ts';
import {
  savedAccounts,
  hostPinKey,
  activeAccountKey,
  updateAccount,
  rememberAccount,
  type AccountLogin,
} from './connectionAccounts.ts';
import { suspendCached } from './util/responseCache.ts';
import { tr } from './i18n/tr.ts';

type Connection = { baseUrl: string; token: string };
const CONNECTION = 'connection';
const SIGNED_OUT = 'connection.signedOut';
const LAST_ADDRESS = 'connection.lastAddress';
const storage = () => tryPlatform('storage');

function read(): Connection | null {
  try {
    const value = JSON.parse(storage()?.get(CONNECTION) || 'null');
    return value && typeof value.baseUrl === 'string'
      ? { baseUrl: value.baseUrl, token: String(value.token ?? '') }
      : null;
  } catch {
    return null;
  }
}

let sshCapability: Promise<boolean> | undefined;
export function isDeviceSshClient() {
  if (isNativeApp()) return Promise.resolve(true);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname)) return Promise.resolve(false);
  return (sshCapability ??= fetch('/ssh/status', { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    .then(
      async (response) =>
        response.ok &&
        response.headers.get('content-type')?.includes('application/json') === true &&
        (await response.json()).enabled === true,
    )
    .catch(() => false));
}

/** A device switched to SSH mode must not resume a previously saved direct HTTP connection. */
export async function applyConnection(restoreSsh?: () => Promise<void>, signal?: AbortSignal) {
  if (isSignedOut()) {
    // Older native builds could mark the account signed out while leaving its key in use.
    if (isNativeApp()) storage()?.remove('ssh.connected');
    return;
  }
  const saved = read();
  const account = savedAccounts().find((a) => a.id === storage()?.get(activeAccountKey));
  if (isNativeApp()) {
    const ssh = storage()?.get('ssh.connected') === '1';
    let base = await nativeSession();
    signal?.throwIfAborted();
    if (!base && ssh) {
      if (restoreSsh) await restoreSsh();
      base = await nativeSession();
      if (!base) throw new Error(tr('SSH 连接尚未恢复。', 'The SSH connection could not be restored.'));
    } else if (!base && saved && saved.baseUrl !== cfg.api.baseUrl) {
      await nativeHttp(saved.baseUrl);
      base = await nativeSession();
    }
    signal?.throwIfAborted();
    if (base) {
      // The loopback capability changes on login. Never use it as a persisted cache key.
      const identity = storage()?.get('ssh.address') || '';
      const scope = ssh
        ? 'ssh:' + identity + ':' + (storage()?.get('ssh.apiPort') || '9780')
        : (saved?.baseUrl ?? cfg.api.baseUrl);
      setBaseUrl(base, account?.scope ?? scope);
      setAccessToken(saved?.token);
    } else {
      storage()?.set(SIGNED_OUT, '1');
    }
    return;
  }
  if (!saved) {
    if (account) setBaseUrl(cfg.api.baseUrl, account.scope);
    return;
  }
  if (saved.baseUrl !== cfg.api.baseUrl && (await isDeviceSshClient())) {
    storage()?.remove(CONNECTION);
    storage()?.remove('wish.providerGate.ready');
    storage()?.remove(activeAccountKey);
    storage()?.set(SIGNED_OUT, '1');
    return;
  }
  setBaseUrl(saved.baseUrl, account?.scope);
  setAccessToken(saved.token);
}

export const isSignedOut = () => storage()?.get(SIGNED_OUT) === '1';
/** The address last connected to, to fill the sign-in form again. */
export const lastAddress = () => storage()?.get(LAST_ADDRESS) ?? '';
/** Host of the server in use, for labels. */
export function serverName() {
  const saved = read();
  try {
    if (storage()?.get('ssh.connected') === '1') {
      const address = storage()?.get('ssh.address') || '';
      return new URL(address.includes('://') ? address : 'ssh://' + address).host;
    }
    return saved ? new URL(saved.baseUrl).host : globalThis.location.host;
  } catch {
    return globalThis.location.host;
  }
}

/** The API base for what the user typed: an origin, optionally with a path; empty means this page's server. */
export function apiBaseFor(address: string) {
  const text = address.trim();
  if (!text) return cfg.api.baseUrl;
  const url = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `${isNativeApp() ? 'http:' : location.protocol}//${text}`,
  );
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
  const path = url.pathname.replace(/\/+$/, '');
  return url.origin + (path.endsWith('/api') ? path : `${path}/api`);
}

const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

/** Clearing local preferences is not signing out: returns a function that restores the connection. */
export function keepConnection() {
  const store = storage();
  const keys =
    store?.keys().filter((key) => key === CONNECTION || key.startsWith('connection.') || key.startsWith('ssh.')) ?? [];
  const saved = keys.map((key) => [key, store?.get(key)] as const);
  return () => {
    for (const [key, value] of saved) if (value != null) store?.set(key, value);
  };
}

/** Checks that a Wish server answers at this address with this token; throws a readable error otherwise. */
export async function checkConnection(address: string, token: string, signal?: AbortSignal) {
  let base: string;
  try {
    let apiBase = apiBaseFor(address);
    if (isNativeApp()) {
      if (address.trim()) await nativeHttp(apiBase, signal);
      const session = await nativeSession();
      if (!session) throw new Error('No native connection');
      apiBase = session;
    }
    base = new URL(apiBase, location.href).href.replace(/\/+$/, '');
  } catch {
    throw new Error(
      tr(
        '请输入有效的服务器地址，例如 https://wish.example.com。',
        'Enter a valid server address, such as https://wish.example.com.',
      ),
    );
  }
  const target = new URL(base);
  if (location.protocol === 'https:' && target.protocol === 'http:' && !loopback(target.host.replace(/:\d+$/, ''))) {
    throw new Error(
      tr(
        '此页面通过 HTTPS 打开，浏览器不允许它连接 HTTP 地址。请使用 HTTPS 地址。',
        'This page was opened over HTTPS, so the browser will not let it connect to an HTTP address. Use an HTTPS address.',
      ),
    );
  }
  const cancellation = createAbortScope(signal ? [signal] : [], 10_000);
  try {
    let response: Response;
    try {
      response = await fetch(`${base}/version`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: cancellation.signal,
      });
    } catch {
      throw new Error(
        target.origin === location.origin
          ? tr('无法连接到服务器。请确认服务器正在运行。', 'Could not reach the server. Check that it is running.')
          : tr(
              '无法连接到这个地址。请确认地址正确、服务器正在运行，并且它设置了访问令牌：未设置令牌的 Wish 服务器不接受来自其他网页的连接。',
              'Could not reach this address. Check that it is correct, that the server is running, and that it requires an access token: a Wish server without one does not accept connections from other web pages.',
            ),
      );
    }
    if (response.status === 401) {
      throw new Error(
        token
          ? tr('访问令牌不正确。', 'The access token is not correct.')
          : tr('这个服务器需要访问令牌。', 'This server requires an access token.'),
      );
    }
    const identity = response.ok ? await response.json().catch(() => null) : null;
    if (identity?.name !== 'wish') {
      throw new Error(
        tr(
          `这个地址上没有找到 Wish 服务器（HTTP ${response.status}）。`,
          `No Wish server was found at this address (HTTP ${response.status}).`,
        ),
      );
    }
  } finally {
    cancellation.dispose();
  }
}

/** Saves a checked connection and restarts the app on it. */
export async function connect(
  address: string,
  token: string,
  name = '',
  existingId?: string,
  signal?: AbortSignal,
  ssh?: AccountLogin,
) {
  await suspendCached();
  signal?.throwIfAborted();
  const baseUrl = apiBaseFor(address);
  const store = storage();
  const login = ssh ?? httpAccount(baseUrl, token);
  if (ssh) {
    store?.set(hostPinKey(ssh.address), ssh.fingerprint);
    store?.set('ssh.address', ssh.address);
    if (isNativeApp()) store?.set('ssh.apiPort', String(ssh.apiPort));
    store?.set('ssh.identity', ssh.identity);
    store?.set('ssh.connected', '1');
  } else store?.remove('ssh.connected');
  if (existingId) {
    updateAccount(existingId, login, name);
    store?.set(activeAccountKey, existingId);
  } else rememberAccount(login, name);
  if (baseUrl === cfg.api.baseUrl && !token) store?.remove(CONNECTION);
  else store?.set(CONNECTION, JSON.stringify({ baseUrl, token }));
  store?.set(LAST_ADDRESS, address.trim());
  store?.remove(SIGNED_OUT);
  location.replace(location.pathname + location.search);
}

function accountLogin(baseUrl: string, token: string): AccountLogin {
  const store = storage();
  if (store?.get('ssh.connected') === '1') {
    const address = store.get('ssh.address') || '';
    return sshAccount(address, token);
  }
  return httpAccount(baseUrl, token);
}

export function httpAccount(baseUrl: string, token: string): AccountLogin {
  return {
    method: 'http',
    address: baseUrl === cfg.api.baseUrl ? '' : baseUrl,
    token,
    identity: '',
    apiPort: 0,
    fingerprint: '',
  };
}

function sshAccount(address: string, token: string): AccountLogin {
  const store = storage();
  return {
    method: 'ssh',
    address,
    token,
    identity: store?.get('ssh.identity') || '',
    apiPort: Number(store?.get('ssh.apiPort') || 9780),
    fingerprint: store?.get(hostPinKey(address)) || '',
  };
}

export function loginAccounts() {
  const store = storage();
  if (isSignedOut() && store && store.get('connection.accounts') === null) {
    const last = store.get(LAST_ADDRESS);
    const sshAddress = store.get('ssh.address');
    if (last !== null) {
      const saved = read();
      const login =
        !last && sshAddress
          ? sshAccount(sshAddress, saved?.token || '')
          : accountLogin(apiBaseFor(last), saved?.token || '');
      rememberAccount(login, '');
      store.remove(activeAccountKey);
    }
  }
  return savedAccounts();
}

export async function disconnectBrowserSsh() {
  await fetch('/ssh/logout', {
    signal: AbortSignal.timeout(1500),
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => {});
}

/** Disconnect the transport while preserving this account and its on-device cache. */
export async function signOut() {
  const store = storage();
  if (!isSignedOut() && !store?.get(activeAccountKey)) {
    const saved = read();
    rememberAccount(accountLogin(saved?.baseUrl ?? cfg.api.baseUrl, saved?.token || ''), '', getConnectionScope());
  }
  await suspendCached();
  store?.set(SIGNED_OUT, '1');
  store?.remove(activeAccountKey);
  store?.remove(CONNECTION);
  if (isNativeApp()) {
    store?.remove('ssh.connected');
    await nativeLogout();
  } else if (store?.get('ssh.connected') === '1') {
    await disconnectBrowserSsh();
    store.remove('ssh.connected');
  }
  store?.remove('wish.providerGate.ready');
  location.replace(location.pathname + location.search);
}
