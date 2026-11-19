import { ref, watch } from 'vue';
import { shortcuts } from '../core/state/shortcutsSlice.ts';
import { tr } from '../core/i18n/tr.ts';
import { toast } from './toast.ts';

type LockableKeyboard = { lock(keys: string[]): Promise<void>; unlock(): void };
function keyboard() {
  return (navigator as Navigator & { keyboard?: LockableKeyboard }).keyboard;
}
export const canCaptureTabKeys = () => Boolean(document.fullscreenEnabled && keyboard()?.lock);
export const capturingTabKeys = ref(false);
let requested = false;
let generation = 0;

async function updateLock() {
  if (!requested || document.fullscreenElement !== document.documentElement) return;
  const prefs = shortcuts.value.value.blockedBrowser;
  const codes = [...(prefs.closeTab ? ['KeyW'] : []), ...(prefs.newTab ? ['KeyT'] : [])];
  const current = ++generation;
  if (!codes.length) {
    release();
    return;
  }
  try {
    await keyboard()!.lock(codes);
    if (current === generation) capturingTabKeys.value = true;
  } catch {
    if (current !== generation) return;
    release();
    toast(tr('浏览器未授权键盘锁定。', 'The browser did not grant keyboard lock.'));
  }
}
function release() {
  ++generation;
  if (requested) keyboard()?.unlock();
  requested = false;
  capturingTabKeys.value = false;
}
export async function enterTabCapture() {
  try {
    if (document.fullscreenElement !== document.documentElement) await document.documentElement.requestFullscreen();
    requested = true;
    await updateLock();
  } catch {
    toast(tr('浏览器未允许进入全屏。', 'The browser did not allow fullscreen.'));
  }
}
export function trackTabCapture() {
  const changed = () => {
    if (document.fullscreenElement !== document.documentElement) release();
  };
  document.addEventListener('fullscreenchange', changed);
  const stop = watch(
    () => [shortcuts.value.value.blockedBrowser.closeTab, shortcuts.value.value.blockedBrowser.newTab] as const,
    (next, prev) => {
      if (next[0] !== prev[0] || next[1] !== prev[1]) void updateLock();
    },
  );
  return () => {
    stop();
    document.removeEventListener('fullscreenchange', changed);
    release();
  };
}
