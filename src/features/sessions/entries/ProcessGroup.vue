<script setup lang="ts">
import CopyButton from '../../../ui/components/CopyButton.vue';
// One thumbnail covering a consecutive run of reasoning / tool calls /
// tool results (mixed-entry tool calls fold in here too). Collapsed by
// default; expanded shows the true ordered sequence.
import { computed, ref, watch } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import { blobUrl } from '../../../core/api/endpoints.js';
import { firstLine } from '../../../core/util/fmt.js';
import Icon from '../../../ui/components/Icon.vue';
import Modal from '../../../ui/components/Modal.vue';

const props = defineProps<{ item: any; forced?: boolean }>();
const open = ref(false);
const detail = ref<any>(null);
watch(() => props.forced, (forced) => { if (forced) open.value = true; }, { immediate: true });

const steps = computed(() => props.item.steps ?? []);
const hasTools = computed(() => steps.value.some((s: any) =>
  s.kind === 'entry' || s.block?.type === 'tool_call'));

// Type labels restored (root review): every step states what it IS —
// thinking / tool call / tool result — not just a bare name.
const typeLabel = (s: any): string =>
  s.kind === 'entry' ? i18n.t('entry.toolResult')
  : s.block?.type === 'tool_call' ? i18n.t('entry.toolCall')
  : i18n.t('entry.thinking');
const label = (s: any): string => {
  if (s.kind === 'entry') return s.entry.payload?.tool_name || 'tool';
  if (s.block?.type === 'tool_call') return s.block.name || s.block.tool_name || '—';
  return '';
};
const detailTitle = (s: any): string =>
  s.kind === 'entry' ? `${i18n.t('entry.toolResult')}: ${s.entry.payload?.tool_name || '—'} · #${s.entry.seq}`
  : s.block?.type === 'tool_call' ? `${i18n.t('entry.toolCall')}: ${s.block.name || s.block.tool_name || '—'} · #${s.fromSeq}`
  : `${i18n.t('entry.thinking')} · #${s.fromSeq}`;
const detailText = (s: any): string => s.kind === 'entry'
  ? (s.entry.payload?.content || []).map((b: any) => b.text || '').join('\n')
  : s.block?.type === 'tool_call'
    ? JSON.stringify(s.block.arguments ?? {}, null, 2)
    : s.block?.text || '';
const detailImages = (s: any): any[] =>
  (s.kind === 'entry' ? (s.entry.payload?.content || []) : []).filter((b: any) => b.type === 'image');
const blobSrc = (b: any) => b.data_base64
  ? `data:${b.mime_type || 'image/png'};base64,${b.data_base64}`
  : b.sha256 ? blobUrl(b.sha256) : null;
const preview = (s: any): string => {
  if (s.kind === 'entry') return firstLine((s.entry.payload?.content || []).map((b: any) => b.text || '').join('\n'), 60);
  return firstLine(s.block?.text || '', 60);
};
const stepIcon = (s: any) => s.kind === 'entry' ? 'wrench' : s.block?.type === 'tool_call' ? 'terminal' : 'brain';
</script>

<template>
  <div class="proc-group" :data-seqs="steps.map((s: any) => s.kind === 'entry' ? s.entry.seq : s.fromSeq).filter((n: any) => n != null).join(' ')">
    <button class="proc-head" :aria-expanded="open" @click="open = !open">
      <Icon :name="open ? 'chevron-down' : 'layers'" />
      <span>{{ i18n.t('proc.title') }}</span><span class="proc-count">{{ steps.length }} {{ i18n.t('proc.stepsUnit') }}</span>
      <span v-if="hasTools" class="proc-summary">{{ i18n.t('proc.hasTools') }}</span><Icon class="proc-chevron" :class="{ expanded: open }" name="chevron-down" />
    </button>
    <div v-if="open" class="proc-steps">
      <button v-for="(s, i) in steps" :key="i" class="proc-step"
        :data-seq="s.kind === 'entry' ? s.entry.seq : s.fromSeq" @click="detail = s">
        <Icon :name="stepIcon(s)" />
        <span class="seq">#{{ s.kind === 'entry' ? s.entry.seq : s.fromSeq }}</span>
        <span class="type">{{ typeLabel(s) }}</span>
        <span class="name">{{ label(s) }}</span>
        <span class="pv">{{ preview(s) }}</span>
      </button>
    </div>
    <Modal :open="!!detail" :title="detail ? detailTitle(detail) : ''" wide @close="detail = null">
      <template #actions><CopyButton v-if="detail" :text="detailText(detail)" /></template>
      <template v-if="detail">
        <pre class="detail-pre">{{ detailText(detail) }}</pre>
        <template v-for="(b, j) in detailImages(detail)" :key="'di' + j">
          <img v-if="blobSrc(b)" class="detail-img" :src="blobSrc(b)!" alt="" loading="lazy" />
        </template>
      </template>
    </Modal>
  </div>
</template>
