import { watch } from 'vue';
import { authHeaders, getBaseUrl } from '../../core/api/client.ts';
import { isSignedOut } from '../../core/connection.ts';
import { sync } from '../../core/state/syncSlice.ts';
import { platform } from '../../platform/index.ts';
import { nativeSession, nativeSshLogin } from '../../platform/native.ts';
import { getKey, hostPinKey } from './sshKeys.ts';

export async function restoreSsh(resumeBase?: string, signal?: AbortSignal) {
  const store = platform('storage');
  const address = store.get('ssh.address') || '';
  const fingerprint = store.get(hostPinKey(address));
  if (!fingerprint || !address) throw new Error('Missing trusted SSH host');
  const id = store.get('ssh.identity');
  const key = id ? await getKey(id) : undefined;
  if (id && !key) throw new Error('Saved SSH identity is missing');
  const result = await nativeSshLogin(
    {
      address,
      fingerprint,
      publicKey: key?.publicKey || '',
      apiPort: Number(store.get('ssh.apiPort') || 9780),
      resumeBase,
    },
    key?.privateKey,
    signal,
  );
  if (!result.ok) throw new Error('SSH reconnect failed');
}

export function watchNativeConnection() {
  if (isSignedOut() || platform('storage').get('ssh.connected') !== '1') return;
  let busy = false;
  let disposed = false;
  let delay = 1000;
  let retry: ReturnType<typeof setTimeout> | undefined;
  function active() {
    return !disposed && !document.hidden && !isSignedOut() && platform('storage').get('ssh.connected') === '1';
  }
  async function check() {
    if (!active() || busy) return;
    clearTimeout(retry);
    busy = true;
    try {
      const base = getBaseUrl();
      // A suspended TCP socket can still look open. Exercise an actual forwarded channel.
      if (await nativeSession()) {
        const response = await fetch(base + '/version', {
          cache: 'no-store',
          headers: authHeaders(),
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
        if (response && response.status !== 502 && response.status !== 504) {
          delay = 1000;
          return;
        }
      }
      if (!active()) return;
      await restoreSsh(base);
      if (active()) {
        sync.stop();
        sync.start();
      }
      delay = 1000;
    } catch {
      if (active()) {
        retry = setTimeout(check, delay);
        delay = Math.min(delay * 2, 30000);
      }
    } finally {
      busy = false;
    }
  }
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  const stop = watch(sync.online, (online) => {
    if (!online) void check();
  });
  return () => {
    disposed = true;
    clearTimeout(retry);
    stop();
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('online', check);
  };
}
