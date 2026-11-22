import { computed, ref, type InjectionKey } from 'vue';
import { deviceProxySettings, type DeviceProxySettings } from '../../platform/native.ts';

export const deviceProxyDraftKey: InjectionKey<ReturnType<typeof useDeviceProxyDraft>> = Symbol('deviceProxyDraft');

export function useDeviceProxyDraft() {
  const saved = ref<DeviceProxySettings>();
  const url = ref('');
  const backend = ref(false);
  const busy = ref(false);
  const error = ref('');
  const damaged = ref(false);
  const applied = ref(false);
  const dirty = computed(
    () => !!saved.value && (url.value !== saved.value.url || (!!url.value && backend.value) !== saved.value.backend),
  );
  function restore() {
    if (!damaged.value) error.value = '';
    applied.value = false;
    url.value = saved.value?.url ?? '';
    backend.value = saved.value?.backend ?? false;
  }
  async function load() {
    if (saved.value || busy.value) return;
    busy.value = true;
    try {
      saved.value = await deviceProxySettings();
      restore();
    } catch (e) {
      error.value = String(e);
      damaged.value = true;
      saved.value = { url: '', backend: false };
    } finally {
      busy.value = false;
    }
  }
  async function save() {
    busy.value = true;
    try {
      saved.value = await deviceProxySettings({ url: url.value.trim(), backend: !!url.value.trim() && backend.value });
      restore();
      damaged.value = false;
      error.value = '';
      applied.value = true;
      return true;
    } catch (e) {
      error.value = String(e);
      return false;
    } finally {
      busy.value = false;
    }
  }
  return { saved, url, backend, busy, error, applied, dirty, damaged, load, save, restore };
}
