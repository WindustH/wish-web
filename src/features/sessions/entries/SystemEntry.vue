<script setup lang="ts">
import { computed, ref } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import Modal from '../../../ui/components/Modal.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';

const props = defineProps<{ item: any }>();
const open = ref(false);

// Transcript notices come in two severities plus the neutral system chip:
// red = a turn failed outright (wish_run_failed), amber = the backend is
// handling a problem by itself (retries, upstream pause, compaction
// warnings). Same layout, only the color differs.
const WARN_SOURCES = new Set([
  'wish_retry_warning',
  'wish_upstream_paused',
  'wish_compaction_retry',
  'wish_compaction_repartition',
  'wish_compaction_giveup_warning',
  'wish_compaction_recovered',
]);
const SOURCE_LABELS: Record<string, string> = {
  wish_run_failed: 'entry.runFailedNotice',
  wish_retry_warning: 'entry.upstreamRetry',
  wish_upstream_paused: 'entry.upstreamPaused',
  wish_compaction_retry: 'entry.compactionRetry',
  wish_compaction_repartition: 'entry.compactionRepartition',
  wish_compaction_giveup_warning: 'entry.compactionGiveup',
  wish_compaction_recovered: 'entry.compactionRecovered',
};
const source = computed(() => props.item.entry.payload?.source ?? '');
const tone = computed(() => (source.value === 'wish_run_failed'
  ? 'error' : WARN_SOURCES.has(source.value) ? 'warn' : 'system'));
const iconName = computed(() => (tone.value === 'error'
  ? 'x' : tone.value === 'warn' ? 'triangle-alert' : 'circle-dot'));
const label = computed(() => i18n.t(props.item.entry.kind === 'run_interrupted'
  ? 'entry.interruption' : props.item.entry.kind === 'background_terminal'
    ? 'entry.backgroundTerminal' : SOURCE_LABELS[source.value] ?? 'entry.system'));
const text = computed(() => (props.item.entry.payload?.content ?? [])
  .map((block: { text?: string }) => block.text ?? '').join('\n') || props.item.entry.payload?.text || '');
</script>

<template>
  <div class="entry system">
    <div class="body">
      <span v-if="item.entry.kind === 'run_interrupted'" class="stop-marker" role="status"><Icon name="square" />{{ i18n.t('entry.stopped') }}</span>
      <button v-else-if="tone !== 'system'" class="notice-chip" :class="tone" @click="open = true"><Icon :name="iconName" />{{ label }}</button>
      <button v-else class="fold-chip" @click="open = true"><Icon name="circle-dot" />{{ label }}</button>
      <Modal :open="open" :title="label" wide @close="open = false">
        <pre class="detail-pre">{{ text }}</pre>
        <CopyButton :text="text" />
      </Modal>
    </div>
  </div>
</template>

<style scoped>
.stop-marker { color: var(--err); }
.stop-marker :deep(svg) { width: 14px; height: 14px; }
.notice-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; margin: 3px 0; border: 1px solid var(--line); border-radius: var(--radius); background: transparent; color: var(--fg-subtle); font: 400 13px/1.6 var(--font); text-align: left; white-space: normal; overflow-wrap: anywhere; cursor: pointer; }
.notice-chip :deep(svg) { width: 14px; height: 14px; flex: none; }
.notice-chip.warn { color: var(--warn); background: var(--warn-bg); border-color: var(--warn-border); }
.notice-chip.error { color: var(--err); background: var(--err-bg); border-color: var(--err-border); }
.notice-chip:hover { color: var(--accent); }
</style>
