// Only the bundled local WebView can call the native transport. Its ephemeral loopback
// address is kept in memory so existing streaming fetch, media and WebSocket clients work.
export const isNativeApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function setAndroidSurfaceColor(color: string) {
  const host = window as Window & { wishSystemBars?: { postMessage(color: string): void } };
  host.wishSystemBars?.postMessage(color);
}

export async function exitNativeApp() {
  const { exit } = await import('@tauri-apps/api/app');
  await exit();
}
export async function nativeSession(): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('native_session');
}
export async function nativeHttp(address: string, signal?: AbortSignal) {
  const { invoke } = await import('@tauri-apps/api/core');
  signal?.throwIfAborted();
  await invoke('native_http', { address });
}
export async function nativeLogout() {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('native_logout');
}
export async function nativeSshLogin(
  input: { address: string; fingerprint: string; publicKey: string; apiPort: number; resumeBase?: string },
  privateKey?: CryptoKey,
  signal?: AbortSignal,
) {
  const { Channel, invoke } = await import('@tauri-apps/api/core');
  signal?.throwIfAborted();
  const events = new Channel<{ id: string; data: string }>();
  let signingError: unknown;
  events.onmessage = async ({ id, data }) => {
    let signature = '';
    try {
      if (!privateKey) throw new Error('Missing signing key');
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const algorithm = privateKey.algorithm.name === 'ECDSA' ? { name: 'ECDSA', hash: 'SHA-256' } : 'Ed25519';
      const raw = await crypto.subtle.sign(algorithm, privateKey, bytes);
      signature = btoa(String.fromCharCode(...new Uint8Array(raw)));
    } catch (e) {
      signingError = e;
    }
    await invoke('ssh_prove', { id, signature }).catch(() => {});
  };
  try {
    return await invoke<{ fingerprint?: string; ok?: boolean }>('ssh_login', { input, events });
  } catch (e) {
    throw new Error(String(signingError || e));
  }
}
