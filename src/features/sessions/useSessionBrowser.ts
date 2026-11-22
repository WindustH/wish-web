import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { ApiError } from '../../core/api/client.ts';
import { browserSocket } from '../../core/api/browser.ts';
import { tr } from '../../core/i18n/tr.ts';
import { deviceBrowser } from '../../platform/deviceBrowser.ts';
import { observeLayout } from '../../ui/observeLayout.ts';

type Guest = ReturnType<typeof deviceBrowser>;
interface PageState {
  url: string;
  documentId: number;
  loaded: boolean;
}

// The active session owns the command channel. Its native page is created by
// the first navigation and the sidebar only supplies the visible rectangle.
export function useSessionBrowser(
  session: string,
  enabled: () => boolean,
  surface: Readonly<Ref<HTMLElement | null>>,
  visible: () => boolean,
) {
  const address = ref('');
  const error = ref('');
  const status = ref<'connecting' | 'ready' | 'closed'>('closed');
  const navigating = ref(false);
  let guest: Guest | undefined;
  const pageCreated = ref(false);
  let retry = 0;
  const attempt = ref(0);
  function position() {
    const current = guest;
    if (!current || !pageCreated.value) return;
    const element = visible() ? surface.value : null;
    const radius = element ? parseFloat(getComputedStyle(element).borderTopLeftRadius) : 0;
    void current.bounds(element?.getBoundingClientRect() ?? new DOMRect(), radius).catch((reason) => {
      if (current === guest) error.value = String(reason);
    });
  }
  watch(
    surface,
    (element, _, cleanup) => {
      position();
      if (!element) return;
      cleanup(observeLayout(element, position));
    },
    { flush: 'post' },
  );
  watch(visible, position, { flush: 'post' });
  function closePage() {
    guest?.close();
    guest = undefined;
    pageCreated.value = false;
    navigating.value = false;
    address.value = '';
  }
  async function state(current: Guest) {
    try {
      const response = (await current.run({ action: 'pageState' })) as { result?: PageState; error?: string } | null;
      if (response?.error) throw new Error(response.error);
      return response?.result;
    } catch (cause) {
      if (/^(Error: )?(Page is loading|Page changed before the operation returned)$/.test(String(cause))) return;
      throw cause;
    }
  }
  async function navigate(url: string) {
    if (navigating.value) throw new Error('Browser navigation in progress');
    const destination = new URL(url);
    if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Enter an HTTP or HTTPS URL');
    const current = (guest ??= deviceBrowser(session));
    navigating.value = true;
    try {
      const previous = pageCreated.value ? await state(current) : undefined;
      if (current !== guest) throw new Error('Device browser closed');
      if (pageCreated.value) await current.navigate(destination.href);
      else await current.start(destination.href);
      if (current !== guest) {
        current.close();
        throw new Error('Device browser closed');
      }
      pageCreated.value = true;
      address.value = destination.href;
      position();
      // A native navigation is dispatched before the new document is ready.
      // A bounded wait also handles redirects without reporting the old page.
      const deadline = Date.now() + 6500;
      do {
        const page = await state(current);
        if (current !== guest) throw new Error('Device browser closed');
        if (
          page?.loaded &&
          (previous?.documentId !== page.documentId ||
            (previous && destination.href !== previous.url && page.url === destination.href))
        ) {
          return { dispatched: true, url: page.url };
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      } while (Date.now() < deadline && current === guest);
      return { dispatched: true, loading: true };
    } finally {
      if (current === guest) navigating.value = false;
    }
  }
  async function command(args: Record<string, unknown>) {
    if (args.action === 'open') return { result: await navigate(String(args.url)) };
    if (!pageCreated.value || !guest)
      return { error: 'Device browser connected. Use open with a URL to load the first page.' };
    if (navigating.value) return { error: 'Device browser navigation in progress' };
    return await guest.run(args);
  }

  watch(
    [enabled, attempt],
    ([active], _, cleanup) => {
      error.value = '';
      status.value = 'closed';
      if (!active) {
        closePage();
        retry = 0;
        return;
      }
      const abort = new AbortController();
      let ws: WebSocket | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      function lost(reason: string, permanent = false) {
        if (abort.signal.aborted || timer !== undefined) return;
        clearInterval(heartbeat);
        status.value = 'closed';
        const occupied = reason.includes('already connected');
        error.value = occupied ? tr('另一台设备已连接此会话', 'Another device is connected to this session') : reason;
        if (occupied) closePage();
        if (permanent) return;
        timer = setTimeout(() => attempt.value++, occupied ? 15000 : Math.min(15000, 1000 * 2 ** Math.min(retry++, 4)));
      }
      status.value = 'connecting';
      void browserSocket(session, abort.signal)
        .then((socket) => {
          if (abort.signal.aborted) {
            socket.close();
            return;
          }
          ws = socket;
          socket.onclose = () => lost(tr('设备连接已断开', 'Device disconnected'));
          socket.onmessage = async ({ data }) => {
            let message;
            try {
              message = JSON.parse(data);
            } catch {
              socket.close(1002, 'Invalid browser message');
              return;
            }
            if (!message || typeof message !== 'object') {
              socket.close(1002, 'Invalid browser message');
              return;
            }
            if (message.error) {
              lost(message.error);
              socket.close();
              return;
            }
            if (message.type === 'ready') {
              status.value = 'ready';
              retry = 0;
              heartbeat = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: 'ping' }));
              }, 15000);
              return;
            }
            if (message.type !== 'command') return;
            let reply;
            try {
              reply = await command(message.args);
            } catch (reason) {
              reply = { error: String(reason) };
            }
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: message.id, ...Object(reply) }));
          };
        })
        .catch((reason) =>
          lost(String(reason), reason instanceof ApiError && [401, 403, 404, 409].includes(reason.status)),
        );
      cleanup(() => {
        abort.abort();
        clearInterval(heartbeat);
        clearTimeout(timer);
        if (ws) {
          ws.onmessage = ws.onclose = null;
          ws.close();
        }
      });
    },
    { immediate: true },
  );
  onBeforeUnmount(closePage);

  async function openAddress() {
    try {
      error.value = '';
      const input = address.value.trim();
      await navigate(input.includes('://') ? input : 'https://' + input);
    } catch (reason) {
      error.value = String(reason);
    }
  }
  function connect() {
    attempt.value++;
  }
  return {
    pageCreated,
    snapshot: async () => {
      if (!guest || !pageCreated.value) throw new Error('Browser is unavailable');
      return guest.snapshot();
    },
    address,
    error,
    status,
    openAddress,
    connect,
  };
}
