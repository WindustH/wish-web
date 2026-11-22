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

export interface DeviceProxySettings {
  url: string;
  backend: boolean;
}
export async function deviceProxySettings(settings?: DeviceProxySettings): Promise<DeviceProxySettings> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('device_proxy_settings', { settings });
}
export async function deviceBrowserProxy(): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('device_browser_proxy');
}

type DownloadBridge = { postMessage(data: string): void; onmessage: ((event: MessageEvent<string>) => void) | null };
let pendingDownload: Promise<void> = Promise.resolve();
let downloadId = 0;
export function saveNativePackage(url: string, filename: string): Promise<string | null> {
  const android = (window as Window & { wishPackageDownload?: DownloadBridge }).wishPackageDownload;
  if (android) {
    const result = pendingDownload.then(
      () =>
        new Promise<string | null>((resolve, reject) => {
          const id = String(++downloadId);
          android.onmessage = (e) => {
            const response = JSON.parse(e.data) as {
              id: string;
              location?: string;
              error?: string;
              cancelled?: boolean;
            };
            if (response.id !== id) return;
            android.onmessage = null;
            if (response.error) reject(new Error(response.error));
            else resolve(response.location ?? null);
          };
          android.postMessage(JSON.stringify({ id, url, filename }));
        }),
    );
    pendingDownload = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  if (/Android/.test(navigator.userAgent)) return Promise.reject(new Error('Android ZIP saving is unavailable'));
  return import('@tauri-apps/api/core').then(({ invoke }) => invoke<string>('save_session_package', { url }));
}
