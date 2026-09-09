<script setup lang="ts">
// One thumbnail covering a consecutive run of reasoning / tool calls /
// tool results (mixed-entry tool calls fold in here too). Collapsed by
// default; expanded shows the true ordered sequence.
import { computed, ref } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import { firstLine } from '../../../core/util/fmt.js';
import Icon from '../../../ui/components/Icon.vue';
import Modal from '../../../ui/components/Modal.vue';

const props = defineProps<{ item: any }>();
const open = ref(false);
const detail = ref<any>(null);

const steps = computed(() => props.item.steps ?? []);
const hasTools = computed(() => steps.value.some((s: any) =>
  s.kind === 'entry' || s.block?.type === 'tool_call'));

const label = (s: any): string => {
  if (s.kind === 'entry') return s.entry.payload?.tool_name || 'tool';
  if (s.block?.type === 'tool_call') return s.block.name || s.block.tool_name || '—';
  return '';
};
const preview = (s: any): string => {
  if (s.kind === 'entry') return firstLine((s.entry.payload?.content || []).map((b: any) => b.text || '').join('\n'), 60);
  return firstLine(s.block?.text || '', 60);
};
const stepIcon = (s: any) => s.kind === 'entry' ? 'wrench' : s.block?.type === 'tool_call' ? 'terminal' : 'brain';
</script>

<template>
  <div class="proc-group">
    <button class="proc-head" :aria-expanded="open" @click="open = !open">
      <Icon :name="open ? 'chevron-down' : 'layers'" />
      {{ i18n.t('proc.title') }} · {{ steps.length }} {{ i18n.t('proc.stepsUnit') }}
      <span v-if="hasTools"> · {{ i18n.t('proc.hasTools') }}</span>
    </button>
    <div v-if="open" class="proc-steps">
      <button v-for="(s, i) in steps" :key="i" class="proc-step" @click="detail = s">
        <Icon :name="stepIcon(s)" />
        <span class="seq">#{{ s.kind === 'entry' ? s.entry.seq : s.fromSeq }}</span>
        <span class="name">{{ label(s) }}</span>
        <span class="pv">{{ preview(s) }}</span>
      </button>
    </div>
    <Modal :open="!!detail" :title="detail ? (detail.kind === 'entry' ? i18n.t('entry.toolResult') : detail.block?.type === 'tool_call' ? i18n.t('entry.toolCall') : i18n.t('entry.thinking')) : ''"
      wide @close="detail = null">
      <pre v-if="detail" class="detail-pre">{{ detail.kind === 'entry'
        ? JSON.stringify(detail.entry.payload, null, 2)
        : JSON.stringify(detail.block, null, 2) }}</pre>
    </Modal>
  </div>
</template>
