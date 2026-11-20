import { checkConnection, connect, disconnectBrowserSsh } from '../../core/connection.ts';
import { tr } from '../../core/i18n/tr.ts';
import type { SavedAccount } from '../../core/connectionAccounts.ts';
import { platform } from '../../platform/index.ts';
import { isNativeApp, nativeSshLogin, nativeLogout } from '../../platform/native.ts';
import { getKey, hostPinKey, withStoredKey, type BrowserKey } from './sshKeys.ts';

async function post(path: string, body: Record<string, string>, signal?: AbortSignal) {
  const response = await fetch('/ssh/' + path, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'SSH login failed');
  return result;
}
export async function loginSsh(
  text: string,
  apiPort: number,
  key: BrowserKey | undefined,
  pin: string,
  token: string,
  name: string,
  existingId?: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const input = { address: text, publicKey: key?.publicKey || '', fingerprint: pin };
  let result = isNativeApp()
    ? await nativeSshLogin({ ...input, apiPort }, key?.privateKey, signal)
    : await post('login', input, signal);
  signal?.throwIfAborted();
  if (result.fingerprint) {
    return String(result.fingerprint);
  }
  if (result.challenge && key) {
    const message = Uint8Array.from(atob(result.challenge), (c) => c.charCodeAt(0));
    const signature = await crypto.subtle.sign('Ed25519', key.privateKey, message);
    result = await post(
      'prove',
      {
        login: result.login,
        signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
      },
      signal,
    );
  }
  if (!result.ok) throw new Error('SSH login failed');
  try {
    await checkConnection('', token, signal);
    await withStoredKey(key?.id || '', () =>
      connect('', token, existingId ? name : name || key?.name || '', existingId, signal, {
        method: 'ssh',
        address: text,
        token,
        identity: key?.id || '',
        apiPort,
        fingerprint: pin,
      }),
    );
  } catch (e) {
    if (signal?.aborted) throw e;
    if (isNativeApp()) await nativeLogout();
    else await disconnectBrowserSsh();
    throw e;
  }
}
export async function loginSavedSsh(account: SavedAccount, signal?: AbortSignal) {
  const pin = platform('storage').get(hostPinKey(account.address));
  if (!pin || pin !== account.fingerprint)
    throw new Error(tr('请核对 SSH 主机指纹后重新连接。', 'Verify the SSH host fingerprint before reconnecting.'));
  const key = account.identity ? await getKey(account.identity) : undefined;
  if (account.identity && !key)
    throw new Error(tr('已保存的密钥不可用，请重新选择。', 'The saved key is unavailable. Select a login key.'));
  if (await loginSsh(account.address, account.apiPort, key, pin, account.token, account.name, account.id, signal))
    throw new Error(tr('请重新核对主机指纹。', 'Verify the host fingerprint again.'));
}
