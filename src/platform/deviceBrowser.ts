import { deviceBrowserProxy } from './native.ts';
import pageActions from './devicePage.js?raw';

interface Bridge {
  postMessage(value: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
}
function androidBrowser(session: string) {
  const host = (window as Window & { wishDeviceBrowser?: Bridge }).wishDeviceBrowser;
  if (!host) return;
  const attachment = session + ':' + Math.random().toString(36).slice(2);
  let sequence = 0;
  const pending = new Map<string, (response: { result?: unknown; error?: string }) => void>();
  const receive = ({ data }: MessageEvent<string>) => {
    const message = JSON.parse(data);
    pending.get(message.id)?.(message);
  };
  function request(type: string, fields: Record<string, unknown> = {}) {
    host!.onmessage = receive;
    const id = attachment + ':' + ++sequence;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Device browser timed out'));
      }, 10000);
      pending.set(id, (response) => {
        clearTimeout(timer);
        pending.delete(id);
        if (response.error) reject(new Error(response.error));
        else resolve(response.result);
      });
      host!.postMessage(JSON.stringify({ id, session: attachment, type, ...fields }));
    });
  }
  return {
    start: async (url: string) => request('start', { url, proxy: await deviceBrowserProxy() }),
    navigate: (url: string) => request('navigate', { url }),
    bounds: (rect: DOMRect, radius: number) =>
      request('bounds', {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewport: innerWidth,
        radius,
      }),
    async run(args: Record<string, unknown>) {
      const script =
        '(() => {try {' +
        pageActions +
        '\nreturn {result:wishPageAction(' +
        JSON.stringify(args) +
        ')} } catch(e) {return {error:String(e.message || e)}} })()';
      return (await request('run', { script })) ?? { error: 'Page changed before the operation returned' };
    },
    snapshot: async () => String(await request('snapshot')),
    close() {
      host.postMessage(JSON.stringify({ type: 'close', session: attachment, id: 'close' }));
      if (host.onmessage === receive) host.onmessage = null;
      for (const settle of pending.values()) settle({ error: 'Client browser closed' });
    },
  };
}

export function deviceBrowser(session: string) {
  const android = androidBrowser(session);
  if (android) return android;
  if (/Android/.test(navigator.userAgent)) throw new Error('Local WebView unavailable');
  const attachment = crypto.randomUUID();
  async function request(type: string, fields: Record<string, unknown> = {}) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('device_browser', { attachment, request: { type, ...fields } });
  }
  return {
    start: (url: string) => request('start', { url }),
    navigate: (url: string) => request('navigate', { url }),
    bounds: (rect: DOMRect) =>
      request('bounds', {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewport: innerWidth,
      }),
    run: (args: Record<string, unknown>) => request('run', { args }),
    snapshot: async () => String(await request('snapshot')),
    close: () => {
      void request('close').catch(() => {});
    },
  };
}
