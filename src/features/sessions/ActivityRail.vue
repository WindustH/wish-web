<script setup lang="ts">
// The rail itself: a layer floating in the chat's frame, beside the log and above it, holding
// nothing of its own - only the placed nodes of railLayout and the one line they hang on. It
// scrolls with the log by translation, not by living in it, so no row bounds it and no row is
// taller for it. A single event's node opens that event's detail; a gathered one opens the list,
// and only the list - one layer at a time, always.
import { computed, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { layoutRail, type RailNode, type RailRow } from './railLayout.ts';
import ActivityList, { type ActivityItem } from './entries/ActivityList.vue';

const props = defineProps<{ rows: RailRow[]; total: number; x: number; visible: boolean }>();
const emit = defineEmits<{ open: [request: { chipKey: string; stepKey: string | null }] }>();
const isMobile = useIsMobile();
const rail = computed(() => layoutRail(props.rows));
const listOpen = ref(false);
const listItems = computed<ActivityItem[]>(() => gathered.value?.events.map(event => ({
  key: `${event.chipKey}:${event.stepKey ?? ''}`, chipKey: event.chipKey, stepKey: event.stepKey,
  icon: event.icon, title: event.tip, failed: event.failed, warn: event.warn,
})) ?? []);
const gathered = ref<RailNode | null>(null);
function click(node: RailNode) {
  // One thing: straight to it. Several: the list, and nothing else opening behind it.
  if (node.events.length === 1) {
    const event = node.events[0]!;
    emit('open', { chipKey: event.chipKey, stepKey: event.stepKey });
  } else {
    gathered.value = node;
    listOpen.value = true;
  }
}
function pick(item: ActivityItem) {
  listOpen.value = false;
  emit('open', { chipKey: item.chipKey, stepKey: item.stepKey });
}
const label = (node: RailNode) => node.events.length === 1 ? node.tip
  : tr(`${node.count} 项活动`, `${node.count} ${node.count === 1 ? 'activity' : 'activities'}`);
</script>

<template>
  <div class="rail-clip" :class="{ hidden: !visible }" aria-hidden="false">
    <div class="rail-overlay" :style="{ height: `${total}px`, left: `${x}px`, transform: 'translateY(calc(-1 * var(--rail-scroll, 0px)))' }">
      <div v-if="rail.line" class="rail-line" :style="{ top: `${rail.line.top}px`, height: `${rail.line.bottom - rail.line.top}px` }" />
      <button v-for="(node, index) in rail.nodes" :key="index" type="button" class="history-rail-node"
        :class="{ failed: node.failed, warn: !node.failed && node.warn }" :style="{ top: `${node.y - 12}px` }"
        :aria-label="label(node)" aria-haspopup="dialog" :data-seq="node.seq" @click="click(node)">
        <Icon :name="node.icon" />
        <span v-if="node.count > 1" class="history-rail-badge" aria-hidden="true">{{ node.count }}</span>
        <span class="history-rail-tip" aria-hidden="true">{{ label(node) }}</span>
      </button>
    </div>
    <Modal :open="listOpen" :sheet="isMobile" :compact="!isMobile" :title="tr('活动', 'Activity')" content-class="activity-window" @close="listOpen = false">
      <ActivityList :items="listItems" @pick="pick" />
    </Modal>
  </div>
</template>
