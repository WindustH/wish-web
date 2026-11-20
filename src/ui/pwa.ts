// A web release belongs to the origin serving the page, independently of the connected backend.
import { watch, shallowRef } from 'vue';
import { sync } from '../core/state/syncSlice.ts';
import { i18n } from '../core/i18n/index.ts';
import { isNativeApp } from '../platform/native.ts';
import { getWebBuildId } from './buildUpdate.ts';
import { toast } from './toast.ts';

export const needRefresh = shallowRef(false);
const CHECK_INTERVAL = 60_000;
const EVENT_COOLDOWN = 10_000;
let offeredBuild: string | undefined;
let offeredWorker: ServiceWorker | undefined;

function offer(worker?: ServiceWorker | null, build?: string, manual = false) {
  if (manual || (worker ? worker !== offeredWorker : build !== offeredBuild)) needRefresh.value = true;
  if (build) offeredBuild = build;
  if (worker) offeredWorker = worker;
}

async function registerWorker() {
  try {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({
      immediate: true,
      onNeedRefresh: async () => {
        const worker = (await navigator.serviceWorker.getRegistration())?.waiting;
        if (worker) offer(worker);
      },
      // Each tab reloads only when its own user accepts the prompt.
      onNeedReload: () => {},
      onRegisterError(error) {
        console.error('[pwa] registration failed:', error);
        toast(i18n.t('pwa.registerFailed'), { tone: 'error' });
      },
    });
  } catch (error) {
    console.error('[pwa] registration module failed:', error);
    toast(i18n.t('pwa.registerFailed'), { tone: 'error' });
  }
}

export async function checkWebUpdate(manual = true): Promise<'current' | 'ready' | 'waiting'> {
  const build = await getWebBuildId();
  if (build === __WEB_BUILD_ID__) return 'current';
  if (!manual && build === offeredBuild) return 'ready';
  const registration = navigator.serviceWorker?.controller && (await navigator.serviceWorker.getRegistration());
  if (registration) {
    await registration.update();
    if (registration.installing && !registration.waiting) return 'waiting';
  }
  offer(registration?.waiting, build, manual);
  return 'ready';
}

export function initPWA() {
  if (isNativeApp() || !/^https?:$/.test(location.protocol)) return () => {};
  if ('serviceWorker' in navigator) void registerWorker();

  let lastCheck = -Infinity;
  let checking = false;
  const check = async () => {
    if (document.hidden || !navigator.onLine || checking || performance.now() - lastCheck < EVENT_COOLDOWN) return;
    checking = true;
    lastCheck = performance.now();
    try {
      await checkWebUpdate(false);
    } catch (error) {
      console.warn('[pwa] update check failed:', error);
    } finally {
      checking = false;
    }
  };
  const timer = window.setInterval(check, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  const stop = watch(sync.snapshotRevision, (rev) => {
    if (rev > 1) void check();
  });
  void check();
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('online', check);
    stop();
  };
}

export async function refreshApp() {
  try {
    const container = navigator.serviceWorker;
    const waiting = (await container?.getRegistration())?.waiting;
    if (!waiting) {
      location.reload();
      return;
    }
    container.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch (error) {
    console.error('[pwa] update failed:', error);
    toast(i18n.t('pwa.updateFailed'), { tone: 'error' });
  }
}
