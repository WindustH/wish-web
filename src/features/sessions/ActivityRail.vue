<script setup lang="ts">
// The rail itself: a layer inside the log's own scrolling content, so it rides the native scroll
// with no JS on the path - never a frame behind, never a style written while the log moves. It
// holds nothing of its own - only the placed nodes of railLayout and the one line they hang on;
// no row bounds it and no row is taller for it. A single event's node opens that event's detail;
// a gathered one opens a window shaped like a run's own - a timeline of one-line steps, each
// opening its detail in a window of its own over the list.
import { computed, inject, ref } from 'vue';
import { touchButton } from '../../ui/touchButton.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { layoutRail, type RailEvent, type RailNode, type RailRow } from './railLayout.ts';
import ProcessDetail from './entries/ProcessDetail.vue';
import { summarizeSteps, toolResultsKey } from './entries/processDetails.ts';
import VirtualRows from '../../ui/components/VirtualRows.vue';
import { useRailProximity } from './useRailProximity.ts';

const props = defineProps<{ rows: RailRow[]; total: number; visible: boolean; session?: string; drawer?: boolean }>();
const emit = defineEmits<{ open: [request: { chipKey: string; stepKey: string | null; solo?: boolean }] }>();
const isMobile = useIsMobile();
const touch = touchButton();
const railElement = ref<HTMLElement>();
useRailProximity(
  railElement,
  computed(() => !props.drawer),
);
const rail = computed(() => layoutRail(props.rows, props.total));
// Keep one decorative element; gradients fade empty spans without introducing scroll work.
const railLineStyle = computed(() => {
  const { nodes, line } = rail.value;
  if (!line) return {};
  const stops = [`var(--line) 0px`];
  for (let i = 1; i < nodes.length; i++) {
    const start = nodes[i - 1]!.y - line.top;
    const end = nodes[i]!.y - line.top;
    if (end - start > 160) {
      stops.push(
        `var(--line) ${start + 16}px`,
        `transparent ${start + 64}px`,
        `transparent ${end - 64}px`,
        `var(--line) ${end - 16}px`,
      );
    }
    stops.push(`var(--line) ${end}px`);
  }
  return {
    top: `${line.top}px`,
    height: `${line.bottom - line.top}px`,
    background: `linear-gradient(to bottom, ${stops.join(', ')})`,
  };
});

// The gathered window: what the node holds, as the run windows show a run. Its title says all of
// it in a line; its rows are the acts, each opening a window of its own once the list has closed.
const gathered = ref<RailNode | null>(null);
const solo = ref<any>(null);
const detail = computed(() => solo.value);
const sessionResults = inject(toolResultsKey, null);
const relatedResult = computed(() =>
  detail.value?.block?.type === 'tool_call' ? (sessionResults?.value.get(detail.value.block.id) ?? null) : null,
);
const gatherTitle = computed(() => {
  const steps = (gathered.value?.events ?? [])
    .filter((event) => event.stepKey && event.step)
    .map((event) => event.step);
  return steps.length ? summarizeSteps(steps, i18n.locale.value === 'zh') : tr('活动', 'Activity');
});
// Thinking shows as the quiet dot it shows as in a run's window, never an icon of its own.
const isThinking = (event: RailEvent) =>
  !!event.step && event.step.kind !== 'entry' && event.step.block?.type !== 'tool_call';
// A row of the list: the step's own window comes up over the list, which stays up.
function pick(event: RailEvent) {
  if (!event.step) return;
  solo.value = event.step;
}
function click(node: RailNode) {
  // One thing: straight to it. Several: the window, and nothing else opening behind it.
  if (node.events.length === 1) {
    const event = node.events[0]!;
    emit('open', { chipKey: event.chipKey, stepKey: event.stepKey, solo: true });
  } else {
    solo.value = null;
    gathered.value = node;
  }
}
const label = (node: RailNode) =>
  node.events.length === 1
    ? node.tip
    : tr(`${node.count} 项活动`, `${node.count} ${node.count === 1 ? 'activity' : 'activities'}`);
</script>

<template>
  <div
    ref="railElement"
    class="rail-clip"
    :class="{ hidden: !visible }"
    :style="{ height: `${total}px` }"
    :aria-hidden="visible ? undefined : 'true'"
  >
    <div v-if="rail.line" class="rail-line" :style="railLineStyle" />
    <button
      v-for="node in rail.nodes"
      :key="JSON.stringify(node.events.map((event) => [event.chipKey, event.stepKey]))"
      type="button"
      class="history-rail-node"
      :class="{ gathered: node.count > 1, failed: node.failed, warn: !node.failed && node.warn }"
      :style="{ top: `${node.y - 12}px` }"
      :aria-label="label(node)"
      aria-haspopup="dialog"
      :data-seq="node.seq"
      @click="touch.acceptsClick($event) && click(node)"
      @touchstart.passive="touch.start"
      @touchmove.passive="touch.move"
      @touchend="touch.end"
      @touchcancel="touch.cancel"
    >
      <span v-if="node.count > 1" class="history-rail-count" aria-hidden="true">+{{ node.count }}</span>
      <Icon v-else :name="node.icon" />
      <span class="history-rail-tip" aria-hidden="true">{{ label(node) }}</span>
    </button>
    <Modal
      :open="!!gathered"
      :sheet="isMobile"
      wide
      :title="gatherTitle"
      body-scroll="content"
      content-class="process-window"
      @close="gathered = null"
    >
      <VirtualRows
        v-slot="{ index }"
        class="process-virtual modal-scroll-region"
        :count="gathered?.events.length ?? 0"
        :item-key="(index) => `${gathered!.events[index]!.chipKey}:${gathered!.events[index]!.stepKey ?? ''}`"
      >
        <div
          v-for="event in [gathered!.events[index]!]"
          :key="`${event.chipKey}:${event.stepKey ?? ''}`"
          class="proc-event"
          :class="{ thinking: isThinking(event), failed: event.failed }"
        >
          <button
            type="button"
            class="proc-event-button"
            :class="{ current: detail?.key === (event.stepKey ?? event.chipKey) }"
            :data-seq="event.seq"
            @click="pick(event)"
          >
            <span class="proc-event-mark"><Icon v-if="event.icon && !isThinking(event)" :name="event.icon" /></span>
            <span class="proc-event-text"
              ><strong>{{ event.tip }}</strong
              ><small v-if="event.preview">{{ event.preview }}</small></span
            >
          </button>
        </div>
      </VirtualRows>
    </Modal>
    <!-- A picked step's own window, over the gathered list: closing it returns to the list. -->
    <ProcessDetail v-if="solo" :step="solo" :related-result="relatedResult" :session="session" @close="solo = null" />
  </div>
</template>
