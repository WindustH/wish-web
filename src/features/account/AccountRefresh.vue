<script setup lang="ts">
// When the readings were taken, and a button to read again; sits in a title bar.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ checkedAt: number | null; loading: boolean }>();
defineEmits<{ refresh: [] }>();
const time = computed(() => props.checkedAt
  ? new Date(props.checkedAt).toLocaleTimeString(i18n.locale.value === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' })
  : '');
</script>

<template>
  <span v-if="time" class="account-updated">{{ tr(`更新于 ${time}`, `Updated ${time}`) }}</span>
  <Hint :text="tr('刷新', 'Refresh')"><button type="button" class="btn ghost icon-only" :disabled="loading" :aria-label="tr('刷新', 'Refresh')" @click="$emit('refresh')"><Icon name="refresh-cw" :class="{ spin: loading }" /></button></Hint>
</template>

<style>
.account-updated { font-size: 12px; color: var(--fg-subtle); white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
