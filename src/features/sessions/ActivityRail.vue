<script setup lang="ts">
// The rail itself: a layer floating in the chat's frame, beside the log and above it, holding
// nothing of its own - only the placed nodes of railLayout and the one line they hang on. It
// scrolls with the log by translation, not by living in it, so no row bounds it and no row is
// taller for it. A single event's node opens that event's detail; a gathered one opens a window
// shaped like a run's own - a timeline of one-line steps, each opening its detail as a panel of
// that same window, never a second over it.
import { computed, inject, ref } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { layoutRail, type RailEvent, type RailNode, type RailRow } from './railLayout.ts';
import ProcessDetail from './entries/ProcessDetail.vue';
import { summarizeSteps, toolResultsKey } from './entries/processDetails.ts';

const props = defineProps<{ rows: RailRow[]; total: number; x: number; visible: boolean; scroll: number; session?: string }>();
const emit = defineEmits<{ open: [request: { chipKey: string; stepKey: string | null }] }>();
const isMobile = useIsMobile();
const rail = computed(() => layoutRail(props.rows));

// The gathered window: what the node holds, as the run windows show a run. Its title says all of
// it in a line; its rows are the acts; a row's detail rises in the same window, under the list.
const gathered = ref<RailNode | null>(null);
const detail = ref<any>(null);
const sessionResults = inject(toolResultsKey, null);
const relatedResult = computed(() => detail.value?.block?.type === 'tool_call' ? sessionResults?.value.get(detail.value.block.id) ?? null : null);
const gatherTitle = computed(() => {
  const steps = (gathered.value?.events ?? []).filter(event => event.stepKey && event.step).map(event => event.step);
  return steps.length ? summarizeSteps(steps, i18n.locale.value === 'zh') : tr('活动', 'Activity');
});
// Thinking shows as the quiet dot it shows as in a run's window, never an icon of its own.
const isThinking = (event: RailEvent) => !!event.step && event.step.kind !== 'entry' && event.step.block?.type !== 'tool_call';
function click(node: RailNode) {
  // One thing: straight to it. Several: the window, and nothing else opening behind it.
  if (node.events.length === 1) {
    const event = node.events[0]!;
    emit('open', { chipKey: event.chipKey, stepKey: event.stepKey });
  } else {
    gathered.value = node;
    detail.value = null;
  }
}
const label = (node: RailNode) => node.events.length === 1 ? node.tip
  : tr(`${node.count} 项活动`, `${node.count} ${node.count === 1 ? 'activity' : 'activities'}`);
</script>

<template>
  <div class="rail-clip" :class="{ hidden: !visible }" :aria-hidden="visible ? undefined : 'true'">
    <div class="rail-overlay" :style="{ height: `${total}px`, left: `${x}px`, transform: `translate3d(0, ${-scroll}px, 0)` }">
      <div v-if="rail.line" class="rail-line" :style="{ top: `${rail.line.top}px`, height: `${rail.line.bottom - rail.line.top}px` }" />
      <button v-for="(node, index) in rail.nodes" :key="index" type="button" class="history-rail-node"
        :class="{ failed: node.failed, warn: !node.failed && node.warn }" :style="{ top: `${node.y - 12}px` }"
        :aria-label="label(node)" aria-haspopup="dialog" :data-seq="node.seq" @click="click(node)">
        <Icon :name="node.icon" />
        <span v-if="node.count > 1" class="history-rail-badge" aria-hidden="true">{{ node.count }}</span>
        <span class="history-rail-tip" aria-hidden="true">{{ label(node) }}</span>
      </button>
    </div>
    <Modal :open="!!gathered" :sheet="isMobile" wide :title="gatherTitle" content-class="process-window" @close="gathered = null; detail = null">
      <ol class="proc-timeline">
        <li v-for="event in gathered?.events ?? []" :key="`${event.chipKey}:${event.stepKey ?? ''}`" class="proc-event"
          :class="{ thinking: isThinking(event), failed: event.failed }">
          <button type="button" class="proc-event-button" :class="{ current: detail?.key === (event.stepKey ?? event.chipKey) }"
            :data-seq="event.seq" @click="detail = event.step">
            <span class="proc-event-mark"><Icon v-if="event.icon && !isThinking(event)" :name="event.icon" /></span>
            <span class="proc-event-text"><strong>{{ event.tip }}</strong><small v-if="event.preview">{{ event.preview }}</small></span>
          </button>
        </li>
      </ol>
      <ProcessDetail v-if="detail" inline :step="detail" :related-result="relatedResult" :session="session" @close="detail = null" />
    </Modal>
  </div>
</template>
