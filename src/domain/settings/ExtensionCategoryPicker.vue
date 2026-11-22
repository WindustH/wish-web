<script setup lang="ts">
import { i18n } from '../../core/i18n/index.ts';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
defineProps<{
  categories: readonly { id: string; label: string; icon: string; status?: string }[];
}>();
const emit = defineEmits<{ selected: [value: string] }>();
const mobile = useIsMobile();
</script>
<template>
  <nav v-if="mobile" class="extension-categories extension-pages" :aria-label="i18n.t('extension.categories')">
    <button v-for="item in categories" :key="item.id" type="button" @click="emit('selected', item.id)">
      <Icon :name="item.icon" />
      <span class="extension-category-text"
        >{{ item.label }}<small v-if="item.status">{{ item.status }}</small></span
      >
      <Icon name="chevron-right" class="section-chevron" />
    </button>
  </nav>
  <nav v-else class="extension-categories settings-link-list" :aria-label="i18n.t('extension.categories')">
    <div v-for="item in categories" :key="item.id" class="set-card">
      <div class="set-row inline">
        <span class="settings-link-label">
          <Icon :name="item.icon" />{{ item.label }}<small v-if="item.status">{{ item.status }}</small>
        </span>
        <button
          class="btn settings-page-link"
          type="button"
          :aria-label="tr('配置', 'Configure') + ' ' + item.label"
          @click="emit('selected', item.id)"
        >
          {{ tr('配置', 'Configure') }}<Icon name="arrow-up-right" :size="15" />
        </button>
      </div>
    </div>
  </nav>
</template>
<style scoped>
.settings-link-label {
  flex-wrap: wrap;
}
.settings-link-label small {
  color: var(--fg-subtle);
  font-weight: 400;
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
  min-height: 54px;
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
  font-weight: 400;
  color: var(--fg-subtle);
}
.extension-pages .section-chevron {
  width: 16px;
  color: var(--fg-faint);
}
@media (hover: hover) {
  .extension-pages button:hover {
    background-color: var(--bg-hover);
  }
}
.extension-pages button:focus-visible {
  outline-offset: -2px;
}
</style>
