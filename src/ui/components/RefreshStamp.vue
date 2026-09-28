<script setup lang="ts">
// When a page's readings were taken, and a button to read again; sits in a title bar.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import Hint from './Hint.vue';
import Icon from './Icon.vue';

const props = defineProps<{ at: number | string | Date | null | undefined; loading: boolean }>();
defineEmits<{ refresh: [] }>();
// Today's readings need only the time; older ones say which day too.
const stamp = computed(() => {
  if (props.at == null) return '';
  const at = new Date(props.at);
  const today = at.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(i18n.locale.value === 'zh' ? 'zh-CN' : 'en', today
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at);
});
</script>

<template>
  <span v-if="stamp" class="refresh-stamp">{{ tr(`更新于 ${stamp}`, `Updated ${stamp}`) }}</span>
  <Hint :text="tr('刷新', 'Refresh')"><button type="button" class="btn ghost icon-only" :disabled="loading" :aria-label="tr('刷新', 'Refresh')" @click="$emit('refresh')"><Icon name="refresh-cw" :class="{ spin: loading }" /></button></Hint>
</template>

<style>
.refresh-stamp { font-size: 12px; color: var(--fg-subtle); white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
