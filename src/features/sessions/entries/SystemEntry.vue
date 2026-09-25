<script setup lang="ts">
import { computed, ref } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import Modal from '../../../ui/components/Modal.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import ProcessDetail from './ProcessDetail.vue';
import Icon from '../../../ui/components/Icon.vue';

const props = defineProps<{ item: any }>();
const open = ref(false);
const detailModal = ref<InstanceType<typeof Modal> | null>(null);
const background = computed(() => props.item.entry.payload?.background);
const backgroundOutput = computed(() => props.item.entry.payload?.result?.output);
const backgroundFailed = computed(() => backgroundOutput.value?.process?.status === 'killed' || backgroundOutput.value?.error || backgroundOutput.value?.process?.error || (backgroundOutput.value?.process?.exit_code != null && backgroundOutput.value.process.exit_code !== 0));
const backgroundLabel = computed(() => {
  const zh=i18n.locale.value==='zh';
  if(backgroundOutput.value?.process?.status==='killed')return zh?'后台 Shell 已终止':'Background shell terminated';
  if(backgroundFailed.value)return zh?'后台 Shell 执行失败':'Background shell failed';
  return zh?'后台 Shell 已完成':'Background shell completed';
});

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
const label = computed(() => props.item.entry.kind === 'developer_message' ? 'Developer Message' : i18n.t(props.item.entry.kind === 'run_interrupted'
  ? 'entry.interruption' : props.item.entry.kind === 'background_terminal'
    ? 'entry.backgroundTerminal' : SOURCE_LABELS[source.value] ?? 'entry.system'));
const text = computed(() => (props.item.entry.payload?.content ?? [])
  .map((block: { text?: string }) => block.text ?? '').join('\n') || props.item.entry.payload?.text || '');
</script>

<template>
  <div class="entry system">
    <div class="body">
      <button v-if="background" class="fold-chip" @click="open=true"><Icon name="terminal"/>{{backgroundLabel}}</button>
      <span v-else-if="item.entry.kind === 'run_interrupted'" class="stop-marker" role="status"><Icon name="square" />{{ i18n.t('entry.stopped') }}</span>
      <button v-else-if="tone !== 'system'" class="notice-chip" :class="tone" @click="open = true"><Icon :name="iconName" />{{ label }}</button>
      <button v-else class="fold-chip" @click="open = true"><Icon name="circle-dot" />{{ label }}</button>
      <ProcessDetail v-if="open && item.entry.payload?.background" :step="{kind:'entry',entry:item.entry}" @close="open=false"/>
      <Modal v-else ref="detailModal" :open="open" :title="label" compact content-class="system-detail" @close="open = false">
        <div class="system-detail-actions">
          <CopyButton :text="text" />
          <button type="button" class="btn ghost icon-only" :aria-label="i18n.t('common.close')" @click="detailModal?.close()"><Icon name="x" /></button>
        </div>
        <pre class="detail-pre">{{ text }}</pre>
      </Modal>
    </div>
  </div>
</template>

<style scoped>
:global(.modal-card.system-detail:not(.modal-page)){width:max-content;max-width:min(94vw,42.5rem)}
:global(.system-detail.compact .modal-body){position:relative;padding:14px 16px 16px;min-width:min(270px,calc(100vw - 48px))}
:global(.system-detail .modal-body){overflow:hidden}
:global(.system-detail .modal-flow-title){padding-right:70px;margin-bottom:10px}
:global(.system-detail .system-detail-actions){position:absolute;right:12px;top:8px;display:flex;align-items:center;gap:2px}
:global(.system-detail .system-detail-actions .btn){min-width:28px;width:28px;min-height:28px;height:28px;padding:0}
:global(.system-detail .modal-body > .detail-pre){margin:0;max-height:calc(84dvh - 140px);overflow:auto;white-space:pre-wrap}

.stop-marker { color: var(--err); }
.stop-marker :deep(svg) { width: 14px; height: 14px; }
.notice-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; margin: 3px 0; border: 1px solid var(--line); border-radius: var(--radius); background: transparent; color: var(--fg-subtle); font: 400 13px/1.6 var(--font); text-align: left; white-space: normal; overflow-wrap: anywhere; cursor: pointer; transition: filter var(--dur-fast); }
.notice-chip :deep(svg) { width: 14px; height: 14px; flex: none; }
.notice-chip.warn { color: var(--warn); background: var(--warn-bg); border-color: var(--warn-border); }
.notice-chip.error { color: var(--err); background: var(--err-bg); border-color: var(--err-border); }
/* Hover stays inside the chip's own hue: brightening the whole chip reads
   as emphasis without swapping the foreground to the accent, which clashed
   (amber chip, orange hover). Applies equally to the warn and error tones. */
@media (hover: hover) { .notice-chip:hover { filter: brightness(1.06); } }
</style>
