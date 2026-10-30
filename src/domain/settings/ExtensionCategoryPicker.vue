<script setup lang="ts">
import { i18n } from '../../core/i18n/index.ts';
import { computed } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import SelectField from '../providers/SelectField.vue';
const props = defineProps<{
  modelValue?: string;
  pages?: boolean;
  categories: readonly { id: string; label: string; icon: string; summary: string }[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const options = computed(() =>
  props.categories.map((item) => ({ value: item.id, label: item.label, icon: item.icon })),
);
</script>
<template>
  <nav v-if="pages" class="extension-categories extension-pages" :aria-label="i18n.t('extension.categories')">
    <button v-for="item in categories" :key="item.id" type="button" @click="emit('update:modelValue', item.id)">
      <Icon :name="item.icon" />
      <span class="extension-category-text"
        >{{ item.label }}<small>{{ item.summary }}</small></span
      >
      <Icon name="chevron-right" class="section-chevron" />
    </button>
  </nav>
  <SelectField
    v-else
    class="extension-category-select"
    :aria-label="i18n.t('extension.categories')"
    :model-value="modelValue ?? categories[0]?.id ?? ''"
    :options="options"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
<style scoped>
.extension-category-select {
  width: 100%;
}
.extension-pages {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 18px;
  overflow: hidden;
}
.extension-pages button {
  display: flex;
  align-items: center;
  font: inherit;
  cursor: pointer;
  text-align: start;
  min-height: 66px;
  padding: 12px 14px;
  gap: 14px;
  border: 0;
  border-radius: 0;
  background: var(--bg-group);
  background-clip: padding-box;
  color: var(--fg);
  font-size: 15px;
  font-weight: 500;
}
.extension-pages button + button {
  border-top: 2px solid transparent;
}
.extension-pages button:active {
  background-color: var(--bg-group-active);
}
.extension-pages .icon {
  flex: none;
  width: 21px;
  height: 21px;
  color: var(--fg-muted);
}
.extension-category-text {
  flex: 1;
  min-width: 0;
}
.extension-category-text small {
  display: block;
  margin-top: 2px;
  color: var(--fg-subtle);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
.extension-pages .section-chevron {
  width: 16px;
  color: var(--fg-faint);
}
</style>
