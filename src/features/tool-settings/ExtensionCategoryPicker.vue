<script setup lang="ts">
import { computed } from 'vue';
import { extensionSections } from '../../extensions/settings.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import SelectField from '../../ui/domain/providers/SelectField.vue';
defineProps<{ modelValue?: string; pages?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const options = computed(() =>
  extensionSections.value.map((item) => ({ value: item.id, label: item.label, icon: item.icon })),
);
</script>
<template>
  <nav
    v-if="pages"
    class="extension-categories extension-pages"
    :aria-label="tr('扩展工具分类', 'Extension tool categories')"
  >
    <button v-for="item in extensionSections" :key="item.id" type="button" @click="emit('update:modelValue', item.id)">
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
    :aria-label="tr('扩展工具分类', 'Extension tool categories')"
    :model-value="modelValue ?? extensionSections[0]!.id"
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
