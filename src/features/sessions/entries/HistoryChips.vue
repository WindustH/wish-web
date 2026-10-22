<script setup lang="ts">
// The activity a reply led with, gathered into ONE node in its gutter; on a row the turn ended on
// with no reply, a short horizontal strip of such nodes. One thing done opens its window straight
// on itself; several open a list of every thing, each line leading to its own detail. Windows are
// hosted by the chips themselves - a node variant when the chip owns its node, a ghost when the
// rail's gathered node speaks for it.
import { computed, inject, ref } from 'vue';
import type { ChipItem } from '../grouping.ts';
import { i18n } from '../../../core/i18n/index.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Icon from '../../../ui/components/Icon.vue';
import Modal from '../../../ui/components/Modal.vue';
import { useIsMobile } from '../../../ui/composables/useMedia.ts';
import { summarizeSteps, toolResultsKey } from './processDetails.ts';
import { chipEvents, chipFace, resultLookup } from './railMeta.ts';
import ActivityList from './ActivityList.vue';
import ProcessGroup from './ProcessGroup.vue';
import SystemEntry from './SystemEntry.vue';

const props = defineProps<{ chips: ChipItem<any>[]; session?: string; forcedKeys?: ReadonlySet<string>; strip?: boolean }>();
const isMobile = useIsMobile();
const sessionResults = inject(toolResultsKey, null);
const lookup = (chip: any) => resultLookup(chip, sessionResults?.value);

// Every chip as one face, and - gathered - the reply's single node: the first act's icon, all it
// did as the badge, the worst that happened as the colour, the first step's place as the anchor.
const faces = computed(() => props.chips.map(chip => ({ chip, face: chipFace(chip, lookup(chip)) })));
const gathered = computed(() => {
  const steps = props.chips.filter(chip => chip.type === 'process').flatMap(chip => chip.steps ?? []);
  return {
    icon: faces.value[0]?.face.icon ?? 'thinking',
    count: faces.value.reduce((sum, entry) => sum + entry.face.count, 0),
    failed: faces.value.some(entry => entry.face.failed),
    warn: faces.value.some(entry => entry.face.warn),
    seq: faces.value[0]?.face.seq,
    tip: steps.length ? summarizeSteps(steps, i18n.locale.value === 'zh') : faces.value[0]?.face.tip ?? '',
  };
});

// The list a gathered node opens: every step of every run and every notice, in the order they came.
const items = computed(() => faces.value.flatMap(({ chip, face }) => chip.type === 'process'
  ? chipEvents(chip, lookup(chip)).map(event => ({ key: event.key, chipKey: chip.key, icon: event.icon, title: event.title, failed: event.failed, warn: false }))
  : [{ key: chip.key, chipKey: chip.key, icon: face.icon, title: face.tip, failed: face.failed, warn: face.warn }]));
const listOpen = ref(false);
// Picking a line hands its chip the opening: a step preset for a run, a plain open for a notice.
const stepPicks = ref<Record<string, { key: string; tick: number }>>({});
const noticeTicks = ref<Record<string, number>>({});
function pick(key: string) {
  const item = items.value.find(entry => entry.key === key);
  if (!item) return;
  listOpen.value = false;   // one layer at a time: the list closes into the thing it picked
  const chip = props.chips.find(entry => entry.key === item.chipKey);
  if (chip?.type === 'process') stepPicks.value = { ...stepPicks.value, [item.chipKey]: { key: item.key, tick: (stepPicks.value[item.chipKey]?.tick ?? 0) + 1 } };
  else noticeTicks.value = { ...noticeTicks.value, [item.chipKey]: (noticeTicks.value[item.chipKey] ?? 0) + 1 };
}

// Whether a chip owns its own node - and with it its window - or a ghost hosts it for the rail.
// Beside a reply: the one chip of a reply that did one thing. On a strip: a shown chip that did
// one thing. Everything else answers to the gathered node and its list.
const ownsNode = (entry: { chip: any; face: any }) => entry.face.count <= 1
  && (!props.strip ? faces.value.length === 1 : stripFaces.value.includes(entry));
const railSingle = computed(() => !props.strip && faces.value.length === 1 && faces.value[0]!.face.count <= 1);
// A strip row shows at most three of its chips side by side; the rest wait behind a "+N".
const shownCount = computed(() => (props.strip ? Math.min(props.chips.length, 3) : props.chips.length));
const stripFaces = computed(() => faces.value.slice(0, shownCount.value));
const more = computed(() => Math.max(0, props.chips.length - shownCount.value));
</script>

<template>
  <span v-if="!strip" class="history-rail" role="group" :aria-label="tr('活动', 'Activity')">
    <!-- One thing done: the chip's own node, opening its window straight on that thing. -->
    <template v-if="railSingle">
      <ProcessGroup v-if="faces[0]!.chip.type === 'process'" variant="node" :item="faces[0]!.chip" :session="session" :forced="forcedKeys?.has(faces[0]!.chip.key)" />
      <SystemEntry v-else variant="node" :item="faces[0]!.chip" :forced="forcedKeys?.has(faces[0]!.chip.key)" />
    </template>
    <!-- Several: one gathered node. It opens the list - and only the list; a line of it opens the
         detail, the list closing behind it. One layer at a time, never two. -->
    <button v-else type="button" class="history-rail-node" :class="{ failed: gathered.failed, warn: !gathered.failed && gathered.warn }"
      :aria-label="gathered.tip" aria-haspopup="dialog" :data-seq="gathered.seq" @click="listOpen = true">
      <Icon :name="gathered.icon" />
      <span v-if="gathered.count > 1" class="history-rail-badge" aria-hidden="true">{{ gathered.count }}</span>
      <span class="history-rail-tip" aria-hidden="true">{{ gathered.tip }}</span>
    </button>
    <Modal :open="listOpen" :sheet="isMobile" :compact="!isMobile" :title="tr('活动', 'Activity')" content-class="activity-window" @close="listOpen = false">
      <ActivityList :items="items" @pick="pick" />
    </Modal>
    <!-- The windows of the chips that do not own their node, hosted unseen: the gathered node
         opens them at the list's request, a search at its own. -->
    <template v-for="entry in faces" :key="entry.chip.key">
      <ProcessGroup v-if="entry.chip.type === 'process' && !ownsNode(entry)" variant="ghost" :item="entry.chip" :session="session"
        :forced="forcedKeys?.has(entry.chip.key)" :open-step="stepPicks[entry.chip.key]" />
      <SystemEntry v-else-if="entry.chip.type !== 'process' && !ownsNode(entry)" variant="ghost" :item="entry.chip"
        :forced="forcedKeys?.has(entry.chip.key)" :open-tick="noticeTicks[entry.chip.key]" />
    </template>
  </span>

  <span v-else class="history-strip" role="group" :aria-label="tr('活动', 'Activity')">
    <!-- A row the turn ended on: its chips side by side, at most three of them; one that did
         several things gathers into its node and answers to the list. -->
    <template v-for="entry in stripFaces" :key="entry.chip.key">
      <ProcessGroup v-if="entry.chip.type === 'process' && entry.face.count <= 1" variant="node" :item="entry.chip" :session="session" :forced="forcedKeys?.has(entry.chip.key)" />
      <SystemEntry v-else-if="entry.chip.type !== 'process' && entry.face.count <= 1" variant="node" :item="entry.chip" :forced="forcedKeys?.has(entry.chip.key)" />
      <button v-else type="button" class="history-rail-node" :class="{ failed: entry.face.failed, warn: !entry.face.failed && entry.face.warn }"
        :aria-label="entry.face.tip" aria-haspopup="dialog" :data-seq="entry.face.seq" @click="listOpen = true">
        <Icon :name="entry.face.icon" />
        <span v-if="entry.face.count > 1" class="history-rail-badge" aria-hidden="true">{{ entry.face.count }}</span>
        <span class="history-rail-tip" aria-hidden="true">{{ entry.face.tip }}</span>
      </button>
    </template>
    <button v-if="more > 0" type="button" class="history-rail-node history-strip-more"
      :aria-label="tr(`还有 ${more} 项活动`, `${more} more`)" aria-haspopup="dialog" @click="listOpen = true">
      +{{ more }}<span class="history-rail-tip" aria-hidden="true">{{ tr(`还有 ${more} 项活动`, `${more} more`) }}</span>
    </button>
    <Modal :open="listOpen" :sheet="isMobile" :compact="!isMobile" :title="tr('活动', 'Activity')" content-class="activity-window" @close="listOpen = false">
      <ActivityList :items="items" @pick="pick" />
    </Modal>
    <template v-for="entry in faces" :key="entry.chip.key">
      <ProcessGroup v-if="entry.chip.type === 'process' && !ownsNode(entry)" variant="ghost" :item="entry.chip" :session="session"
        :forced="forcedKeys?.has(entry.chip.key)" :open-step="stepPicks[entry.chip.key]" />
      <SystemEntry v-else-if="entry.chip.type !== 'process' && !ownsNode(entry)" variant="ghost" :item="entry.chip"
        :forced="forcedKeys?.has(entry.chip.key)" :open-tick="noticeTicks[entry.chip.key]" />
    </template>
  </span>
</template>
