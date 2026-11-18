// UI preferences slice. Persisted through the platform storage adapter —
// in a shell these become native settings with zero feature changes.
import { shallowRef } from 'vue';
import { cfg } from '../config.ts';
import { platform } from '../../platform/index.ts';
import { shortcuts } from './shortcutsSlice.ts';
import { getBaseUrl } from '../api/client.ts';
import { readWorkspaceState, writeWorkspaceState } from '../util/workspaceState.ts';

// An on/off preference, stored as '1' or '0'; until one is stored it has its default.
function toggle(key: string, fallback: boolean) {
  const value = shallowRef(fallback);
  return {
    value,
    load() {
      const stored = platform('storage').get(key);
      if (stored != null) value.value = stored === '1';
    },
    set(next: boolean) {
      value.value = next;
      platform('storage').set(key, next ? '1' : '0');
    },
  };
}

export type TerminalEngine = 'xterm' | 'restty' | 'wraith';
export const prefs = (() => {
  const terminalEngine = shallowRef<TerminalEngine>('xterm');
  function setTerminalEngine(engine: TerminalEngine) {
    terminalEngine.value = engine;
    platform('storage').set('pref.terminalEngine', engine);
  }
  const originalImages = toggle('pref.originalImages', false);
  const sourceWrap = toggle('pref.sourceWrap', true);
  const sendOnEnter = toggle('pref.sendOnEnter', cfg.composer.sendOnEnter);
  const keepAwake = toggle('pref.keepAwake', false);
  const notifyOnFailure = toggle('pref.notifyOnFailure', false); // decisions 22: default OFF
  // The former global preference remains the home/default state. Session overrides
  // share the same bounded, server-scoped workspace storage as the right sidebar.
  const defaultListCollapsed = toggle('pref.sessionListCollapsed', false);
  const sessionListCollapsed = shallowRef(false);
  let sessionListKey: string | null = null;
  function restoreSessionList() {
    sessionListCollapsed.value = sessionListKey
      ? readWorkspaceState(sessionListKey, { collapsed: defaultListCollapsed.value.value }).collapsed
      : defaultListCollapsed.value.value;
  }
  function setSessionListOwner(id: string | null) {
    sessionListKey = id ? JSON.stringify([getBaseUrl(), 'session-list', id]) : null;
    restoreSessionList();
  }
  function setSessionListCollapsed(collapsed: boolean) {
    sessionListCollapsed.value = collapsed;
    if (sessionListKey) writeWorkspaceState(sessionListKey, { collapsed });
    else defaultListCollapsed.set(collapsed);
  }
  // Text size on this device, as a share of its standard size (phones read a step larger).
  const TEXT_SIZE = 'pref.textSize';
  const textSize = shallowRef(1);
  const loaded = shallowRef(false);
  const rightSidebarWidth = shallowRef(0);
  function setRightSidebarWidth(width: number) {
    rightSidebarWidth.value = Number.isFinite(width) && width >= 280 ? width : 0;
    platform('storage').set('pref.rightSidebarWidth', String(rightSidebarWidth.value));
  }

  function load() {
    shortcuts.load();
    const engine = platform('storage').get('pref.terminalEngine');
    terminalEngine.value = engine === 'restty' || engine === 'wraith' ? engine : 'xterm';
    const width = Number(platform('storage').get('pref.rightSidebarWidth'));
    rightSidebarWidth.value = Number.isFinite(width) && width >= 280 ? width : 0;
    for (const pref of [sendOnEnter, keepAwake, notifyOnFailure, defaultListCollapsed, originalImages, sourceWrap])
      pref.load();
    restoreSessionList();
    const size = Number(platform('storage').get(TEXT_SIZE));
    textSize.value = size >= 0.8 && size <= 1.4 ? size : 1;
    loaded.value = true;
  }

  return {
    terminalEngine,
    setTerminalEngine,
    rightSidebarWidth,
    setRightSidebarWidth,
    originalImages: originalImages.value,
    setOriginalImages: originalImages.set,
    sourceWrap: sourceWrap.value,
    setSourceWrap: sourceWrap.set,
    sendOnEnter: sendOnEnter.value,
    keepAwake: keepAwake.value,
    notifyOnFailure: notifyOnFailure.value,
    sessionListCollapsed,
    textSize,
    loaded,
    load,
    setSendOnEnter: sendOnEnter.set,
    setKeepAwake: keepAwake.set,
    setNotifyOnFailure: notifyOnFailure.set,
    setSessionListCollapsed,
    setSessionListOwner,
    setTextSize(v: number) {
      textSize.value = Number.isFinite(v) ? Math.max(0.8, Math.min(1.4, v)) : 1;
      platform('storage').set(TEXT_SIZE, String(textSize.value));
    },
  };
})();
export type PrefsApi = typeof prefs;
