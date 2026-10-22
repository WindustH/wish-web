<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import Modal from '../../../ui/components/Modal.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import ProcessDetail from './ProcessDetail.vue';
import Icon from '../../../ui/components/Icon.vue';
import { useIsMobile } from '../../../ui/composables/useMedia.ts';
import { noticeFailed, noticeIconName, noticeLabel, noticeTone } from './railMeta.ts';

const props = defineProps<{ item: any; forced?: boolean; variant?: 'chip' | 'node' | 'ghost'; openTick?: number }>();
const open = ref(false);
// A search that found something in the notice opens it; so does the rail's list picking it.
watch(() => props.forced, forced => { if (forced) open.value = true; }, { immediate: true });
watch(() => props.openTick, tick => { if (tick) open.value = true; });
const isMobile = useIsMobile();
const detailModal = ref<InstanceType<typeof Modal> | null>(null);
// The notice's faces live in railMeta.ts, shared with the rail that gathers it, so the two can
// never disagree on what a notice is called or how it is drawn.
const background = computed(() => !!props.item.entry.payload?.background);
const failed = computed(() => background.value && noticeFailed(props.item.entry));
const tone = computed(() => noticeTone(props.item.entry));
const iconName = computed(() => noticeIconName(props.item.entry));
const label = computed(() => noticeLabel(props.item.entry));
const nodeFailed = computed(() => failed.value || tone.value === 'error');
const nodeWarn = computed(() => tone.value === 'warn' && !nodeFailed.value);
const text = computed(() => (props.item.entry.payload?.content ?? [])
  .map((block: { text?: string }) => block.text ?? '').join('\n') || props.item.entry.payload?.text || '');
</script>

<template>
  <!-- A notice shares the assistant's activity rail; its detail stays in the existing window. -->
  <span class="history-chip-host" :data-seq="item.entry.seq">
      <template v-if="variant === 'node'">
        <!-- One notice is one thing done: its node opens its window, that single layer alone. -->
        <button type="button" class="history-rail-node" :class="{ failed: nodeFailed, warn: nodeWarn }" :aria-label="label" aria-haspopup="dialog" @click="open = true">
          <Icon :name="iconName" /><span class="history-rail-tip" aria-hidden="true">{{ label }}</span>
        </button>
      </template>
      <!-- A ghost hosts the window with no node: the rail's gathered node opens it instead. -->
      <template v-else-if="variant !== 'ghost'">
        <button v-if="background" type="button" class="history-chip" :class="{ error: failed }" :aria-label="label" aria-haspopup="dialog" @click="open=true"><Icon name="terminal"/><span class="history-chip-text">{{label}}</span></button>
        <button v-else type="button" class="history-chip" :class="tone" :aria-label="label" aria-haspopup="dialog" @click="open = true"><Icon :name="iconName" /><span class="history-chip-text">{{ label }}</span></button>
      </template>
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
