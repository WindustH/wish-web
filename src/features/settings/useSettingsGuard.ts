// Navigation guard and unsaved changes confirmation for settings view.
import { ref, computed, provide, type Ref, type ComputedRef } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { theme } from '../../core/theme/index.js';
import { prefs } from '../../core/state/prefsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { tr } from './fields';
import { errorText } from '../../core/config-editor';
import { settingsReturnKey, type ReturnChange } from './settingsReturn';

export interface SettingsGuardOptions {
  isMobile: Ref<boolean>;
  serverDirty: ComputedRef<boolean>;
  source: Ref<string>;
  revision: Ref<string>;
  error: Ref<string>;
  accept: (value: any) => void;
  load: () => Promise<void>;
  saveConfig: () => Promise<boolean>;
}

export function useSettingsGuard(options: SettingsGuardOptions) {
  const { isMobile, serverDirty, source, revision, error, accept, load, saveConfig } = options;

  const preferenceValue = () => ({
    mode: theme.mode.value,
    locale: i18n.locale.value,
    sendOnEnter: prefs.sendOnEnter.value,
    notifyOnFailure: prefs.notifyOnFailure.value,
    keepAwake: prefs.keepAwake.value,
  });

  const preferenceSource = ref(JSON.stringify(preferenceValue()));

  const dirty = computed(
    () =>
      serverDirty.value ||
      (isMobile.value && JSON.stringify(preferenceValue()) !== preferenceSource.value)
  );

  function restorePreferences() {
    const value = JSON.parse(preferenceSource.value);
    theme.setMode(value.mode);
    i18n.setLocale(value.locale);
    prefs.setSendOnEnter(value.sendOnEnter);
    prefs.setNotifyOnFailure(value.notifyOnFailure);
    prefs.setKeepAwake(value.keepAwake);
  }

  async function save(): Promise<boolean> {
    if (serverDirty.value && !(await saveConfig())) return false;
    preferenceSource.value = JSON.stringify(preferenceValue());
    return true;
  }

  const discard = ref(false);
  async function discardChanges() {
    discard.value = false;
    await load();
  }

  const leave = ref(false);
  const leaveBusy = ref(false);
  const leaveError = ref('');
  let answer: ((value: boolean) => void) | undefined;
  let pendingChange: ReturnChange | undefined;
  const nestedReturns = new Map<symbol, () => Promise<void>>();

  function confirmReturn(change?: ReturnChange): Promise<boolean> {
    if (!(change?.dirty?.() ?? dirty.value)) return Promise.resolve(true);
    if (answer) return Promise.resolve(false);
    pendingChange = change;
    leaveError.value = '';
    leave.value = true;
    return new Promise((resolve) => {
      answer = resolve;
    });
  }

  function finishReturn(value: boolean) {
    leave.value = false;
    const resolve = answer;
    answer = undefined;
    pendingChange = undefined;
    resolve?.(value);
  }

  function resolveLeave(value: boolean) {
    if (leaveBusy.value) return;
    if (value) {
      if (pendingChange?.discard) {
        pendingChange.discard();
      } else {
        if (source.value) {
          accept({ config: JSON.parse(source.value), revision: revision.value });
        }
        if (isMobile.value) {
          restorePreferences();
        }
      }
    }
    finishReturn(value);
  }

  async function saveAndReturn() {
    if (leaveBusy.value) return;
    leaveBusy.value = true;
    leaveError.value = '';
    try {
      if (await (pendingChange?.save ?? save)()) {
        finishReturn(true);
      } else {
        leaveError.value = error.value || tr('保存未完成，请检查输入后重试。', 'Could not save. Check the fields and retry.');
      }
    } catch (e) {
      leaveError.value = errorText(e);
    } finally {
      leaveBusy.value = false;
    }
  }

  provide(settingsReturnKey, {
    confirm: confirmReturn,
    save,
    register: (key, back) => {
      if (back) nestedReturns.set(key, back);
      else nestedReturns.delete(key);
    },
  });

  async function guardReturn() {
    if (isMobile.value && nestedReturns.size) {
      await [...nestedReturns.values()].at(-1)!();
      return false;
    }
    return confirmReturn();
  }

  onBeforeRouteLeave(guardReturn);
  onBeforeRouteUpdate((to, from) =>
    isMobile.value && to.query.section !== from.query.section ? guardReturn() : true
  );

  return {
    dirty,
    save,
    discard,
    discardChanges,
    leave,
    leaveBusy,
    leaveError,
    confirmReturn,
    resolveLeave,
    saveAndReturn,
    guardReturn,
  };
}
