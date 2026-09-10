<script setup lang="ts">
import { computed, ref } from 'vue';
import { ListboxRoot, ListboxFilter, ListboxContent, ListboxItem, ListboxVirtualizer, ListboxItemIndicator } from 'reka-ui';
import { Check, Search } from '@lucide/vue';
import { i18n } from '../../core/i18n/index.js';
import ProviderIcon from './ProviderIcon.vue';

export interface PickerItem { key: string; title: string; description?: string; search?: string; group?: string; brand?: string; alwaysVisible?: boolean }
const props = defineProps<{ items: PickerItem[]; placeholder: string; disabled?: boolean }>();
const selected = defineModel<string>();
const query = ref('');
const filtered = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return props.items.filter(item => item.alwaysVisible || terms.every(term => `${item.title} ${item.description || ''} ${item.group || ''} ${item.search || ''}`.toLocaleLowerCase().includes(term)));
});
const rows = computed(() => new Map(filtered.value.map((item, index, all) => [item.key, { ...item, heading: item.group && item.group !== all[index - 1]?.group }])));
const keys = computed(() => filtered.value.map(item => item.key));
const estimate = (index: number) => rows.value.get(keys.value[index]!)!.heading ? 84 : 52;
const listHeight = computed(() => Math.max(80, keys.value.reduce((height, _, index) => height + estimate(index), 0)));
const textContent = (key: string) => rows.value.get(key)!.title;
</script>

<template>
  <ListboxRoot v-model="selected" class="picker" :disabled="disabled" selection-behavior="replace">
    <div class="picker-search"><Search :size="16" aria-hidden="true" /><ListboxFilter v-model="query" data-initial-focus :placeholder="placeholder" :aria-label="placeholder" autocomplete="off" /></div>
    <!-- Reka caches virtual rows by index. A changed result set must reset
         both memoized options and the measured group offsets/scroll position. -->
    <ListboxContent :key="JSON.stringify(filtered)" class="picker-list" :style="{ height: `min(${listHeight}px, 48dvh, 380px)` }" :aria-label="placeholder">
      <ListboxVirtualizer :options="keys" :estimate-size="estimate" :text-content="textContent" :overscan="5">
        <template #default="{ option, virtualItem }">
          <ListboxItem :value="option" :data-choice-key="option" class="picker-option" :style="{ height: `${estimate(virtualItem.index)}px` }">
            <div v-if="rows.get(option)!.heading" class="picker-group"><ProviderIcon :brand="rows.get(option)!.brand" />{{ rows.get(option)!.group }}</div>
            <div class="picker-row">
              <ProviderIcon v-if="!rows.get(option)!.group" :brand="rows.get(option)!.brand" />
              <div class="picker-label"><span>{{ rows.get(option)!.title }}</span><small v-if="rows.get(option)!.description">{{ rows.get(option)!.description }}</small></div>
              <ListboxItemIndicator class="picker-check"><Check :size="16" /></ListboxItemIndicator>
            </div>
          </ListboxItem>
        </template>
      </ListboxVirtualizer>
      <p v-if="!keys.length" class="hint">{{ i18n.t('picker.empty') }}</p>
    </ListboxContent>
  </ListboxRoot>
</template>

<style scoped>
.picker { min-width: 0; }
.picker-search { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 6px; margin-bottom: 10px; }
.picker-search:focus-within { border-color: var(--accent); }
.picker-search input { flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; outline: none; font: inherit; }
.picker-list { overflow: auto; overscroll-behavior: contain; }
.picker-option { width: 100%; outline: none; cursor: pointer; }
.picker-group { display: flex; align-items: center; gap: 8px; height: 32px; font-size: 12px; color: var(--fg-subtle); padding-inline: 10px; }
.picker-group .provider-icon { width: 16px; height: 16px; }
.picker-row { height: 50px; display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; }
.picker-option[data-highlighted] .picker-row { background: var(--bg-hover); }
.picker-option[data-state="checked"] .picker-row { background: var(--accent-soft); color: var(--accent); }
.picker-label { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.picker-label span, .picker-label small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker-label small { font-size: 11px; color: var(--fg-subtle); }
.picker-check { display: flex; flex: none; }
</style>
