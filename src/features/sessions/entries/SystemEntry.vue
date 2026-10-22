<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import Modal from '../../../ui/components/Modal.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import ProcessDetail from './ProcessDetail.vue';
import Icon from '../../../ui/components/Icon.vue';
import { useIsMobile } from '../../../ui/composables/useMedia.ts';

const props = defineProps<{ item: any; forced?: boolean; rail?: boolean }>();
const open = ref(false);
// A search that found something in the notice opens it.
watch(() => props.forced, forced => { if (forced) open.value = true; }, { immediate: true });
const isMobile = useIsMobile();
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
const iconName = computed(() => (tone.value === 'error' ? 'x' : 'triangle-alert'));
const label = computed(() => props.item.entry.kind === 'developer_message' ? 'Developer Message' : i18n.t(props.item.entry.kind === 'background_terminal'
  ? 'entry.backgroundTerminal' : SOURCE_LABELS[source.value] ?? 'entry.system'));
const text = computed(() => (props.item.entry.payload?.content ?? [])
  .map((block: { text?: string }) => block.text ?? '').join('\n') || props.item.entry.payload?.text || '');
</script>

<template>
  <!-- A notice shares the assistant's activity rail; its detail stays in the existing window. -->
  <span class="history-chip-host" :data-seq="item.entry.seq">
      <button v-if="background" type="button" :class="rail ? ['history-rail-node', { failed: backgroundFailed }] : ['history-chip', { error: backgroundFailed }]" :aria-label="backgroundLabel" aria-haspopup="dialog" @click="open=true"><Icon name="terminal"/><span :class="rail ? 'history-rail-tip' : 'history-chip-text'" :aria-hidden="rail || undefined">{{backgroundLabel}}</span></button>
      <button v-else type="button" :class="rail ? ['history-rail-node', tone] : ['history-chip', tone]" :aria-label="label" aria-haspopup="dialog" @click="open = true"><Icon :name="tone === 'system' ? 'circle-dot' : iconName" /><span :class="rail ? 'history-rail-tip' : 'history-chip-text'" :aria-hidden="rail || undefined">{{ label }}</span></button>
      <ProcessDetail v-if="open && item.entry.payload?.background" :step="{kind:'entry',entry:item.entry}" @close="open=false"/>
      <!-- On a phone it slides up as a run's card does, with the same head; elsewhere a small window. -->
      <Modal v-else ref="detailModal" :open="open" :sheet="isMobile" :title="label" :compact="!isMobile" content-class="system-detail" @close="open = false">
        <template v-if="isMobile" #actions><CopyButton :text="text" /></template>
        <div v-if="!isMobile" class="system-detail-actions">
          <CopyButton :text="text" />
          <button type="button" class="btn ghost icon-only" :aria-label="i18n.t('common.close')" @click="detailModal?.close()"><Icon name="x" /></button>
        </div>
        <pre class="detail-pre">{{ text }}</pre>
      </Modal>
  </span>
</template>

<style scoped>
:global(.modal-card.system-detail:not(.modal-page):not(.modal-sheet)){width:max-content;max-width:min(94vw,42.5rem)}
:global(.system-detail.compact .modal-body){position:relative;padding:14px 16px 16px;min-width:min(270px,calc(100vw - 48px))}
:global(.system-detail .modal-body){overflow:hidden}
:global(.system-detail .modal-flow-title){padding-right:70px;margin-bottom:10px}
:global(.system-detail .system-detail-actions){position:absolute;right:12px;top:8px;display:flex;align-items:center;gap:2px}
:global(.system-detail .system-detail-actions .btn){min-width:28px;width:28px;min-height:28px;height:28px;padding:0}
:global(.system-detail .modal-body > .detail-pre){margin:0;max-height:calc(84dvh - 140px);overflow:auto;white-space:pre-wrap}

</style>
