<script setup lang="ts">
import ProviderIcon from './ProviderIcon.vue';
import InfoHint from './InfoHint.vue';
import { computed, ref, watch } from 'vue';
import { SelectRoot, SelectTrigger, SelectValue, SelectIcon, SelectPortal, SelectContent, SelectViewport, SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui';
import { Check, ChevronDown } from '@lucide/vue';
import { usePageActivity } from '../composables/usePageActivity';

defineOptions({ inheritAttrs: false });
export interface SelectOption { value: string; label: string; brand?: string; annotation?: string; description?: string; disabled?: boolean }
const props = defineProps<{ modelValue: string; options: SelectOption[]; placeholder?: string; disabled?: boolean; searchable?: boolean; searchPlaceholder?: string; emptyText?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const pageActive = usePageActivity();
const open = ref(false);
const query = ref('');
const searchInput = ref<HTMLInputElement>();
const filtered = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return !props.searchable || !term ? props.options : props.options.filter(option =>
    [option.label, option.value, option.annotation].some(value => value?.toLocaleLowerCase().includes(term)));
});
watch(open, () => { query.value = ''; });
watch(searchInput, input => { input?.focus(); });

const unavailable = computed(() => props.disabled || !props.options.some(option => !option.disabled));
watch(unavailable, value => { if (value) open.value = false; });
const selected = computed(() => props.options.find(option => option.value === props.modelValue));
watch(pageActive, active => { if (!active) open.value = false; });
</script>

<template>
  <SelectRoot v-model:open="open" :model-value="selected" by="value" :disabled="unavailable" @update:model-value="option => emit('update:modelValue', (option as SelectOption).value)">
    <SelectTrigger v-bind="$attrs" class="control-select">
      <SelectValue :placeholder="placeholder"><span class="select-option-label"><ProviderIcon v-if="selected?.brand" :brand="selected.brand" /><span>{{ selected?.label || placeholder }}</span></span></SelectValue>
      <SelectIcon as-child><ChevronDown :size="16" aria-hidden="true" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal v-if="pageActive">
      <SelectContent class="control-select-popover" position="popper" :side-offset="5" :collision-padding="12">
        <div v-if="searchable" class="select-search">
          <input ref="searchInput" v-model="query" class="input" type="search" :placeholder="searchPlaceholder" :aria-label="searchPlaceholder" @keydown="event => { if (event.key !== 'Escape') event.stopPropagation(); }" />
        </div>
        <SelectViewport class="control-select-list">
          <SelectItem v-for="option in filtered" :key="option.value" :value="option" :disabled="option.disabled" :text-value="option.label" :data-value="option.value" class="control-select-option">
            <span class="select-option-label"><ProviderIcon v-if="option.brand" :brand="option.brand" /><SelectItemText>{{ option.label }}</SelectItemText></span>
            <span class="select-option-trailing">
              <span v-if="option.annotation" class="select-option-annotation">{{ option.annotation }}</span>
              <InfoHint v-if="option.description" :text="option.description" :label="option.description" :focusable="false" />
              <span class="select-option-check"><SelectItemIndicator><Check :size="15" aria-hidden="true" /></SelectItemIndicator></span>
            </span>
          </SelectItem>
          <p v-if="!filtered.length" class="select-empty">{{ emptyText }}</p>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.select-option-label { display: flex; align-items: center; gap: 9px; min-width: 0; }
.select-option-label > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.select-option-annotation { flex: none; max-width: 10rem; padding: 2px 6px; border-radius: 4px; background: var(--bg); color: var(--fg-subtle); font-size: 10px; line-height: 1.4; white-space: normal; text-align: right; }
.select-option-trailing { display: inline-flex; align-items: center; gap: 8px; flex: none; margin-left: auto; }
.select-option-check { display: inline-flex; align-items: center; justify-content: center; width: 15px; flex: none; }
.select-option-check :deep(svg) { display: block; }

.select-search { padding: 6px; border-bottom: 1px solid var(--line); }
.select-search .input { width: 100%; min-width: 0; }
.select-empty { padding: 12px; color: var(--fg-subtle); font-size: 12px; }
</style>
