<script setup lang="ts">
// A run of steps - thinking, tool calls and their results - as one node on the activity rail: its
// first act's icon, how many things it did on its badge, what it did in words ("ran 3 commands,
// searched the web") in its tip and its window's title. The window is the run as a timeline: a
// card sliding up on a phone, a window on a desktop, every step opening to show all of it. A ghost
// variant hosts the window with no node of its own, opening at the rail's request or a search's.
import { computed, inject, ref, watch } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import { firstLine } from '../../../core/util/fmt.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Icon from '../../../ui/components/Icon.vue';
import Modal from '../../../ui/components/Modal.vue';
import { useIsMobile } from '../../../ui/composables/useMedia.ts';
import ProcessDetail from './ProcessDetail.vue';
import { fileEdits, parseDiff, toolIcon, toolOutput, toolTitle, stepSeq, stepToolName, diffCounts, searchResults, stepIcons, summarizeSteps, stepFailed, toolResultsKey } from './processDetails.ts';
import { expandedBefore, setExpanded, setStep, stepBefore } from '../expandState.ts';
import { chipFace } from './railMeta.ts';

const props = defineProps<{ item: any; forced?: boolean; session?: string; variant?: 'chip' | 'node' | 'ghost';
  openTick?: number; openStep?: { key: string; tick: number } }>();
const isMobile = useIsMobile();
const steps = computed(() => props.item.steps ?? []);
// The window and the step open in it outlast this button: the button moves into the reply that
// comes after the run, and rows come and go as the log scrolls.
const open = ref(!!props.session && expandedBefore(props.session, props.item.key));
const kept = props.session ? stepBefore(props.session, props.item.key) : undefined;
const detail = ref<any>(kept ? steps.value.find((step: any) => step.key === kept.key) ?? null : null);
const diffOnly = ref(kept?.diffOnly ?? false);
// One step, on its own: a window of its own, opened instead of the run's - never inside it. The
// list closes before the step's window opens, so only one dialog is ever up.
const solo = ref<any>(null);
watch(open, value => { if (props.session) setExpanded(props.session, props.item.key, value); });
watch([detail, diffOnly], ([step, only]) => { if (props.session) setStep(props.session, props.item.key, step ? { key: step.key, diffOnly: only } : undefined); });
watch(() => props.openTick, tick => { if (tick) open.value = true; });
// A pick in the rail's gathered window: the step opens in a window of its own, the list gone first.
watch(() => props.openStep, pick => {
  if (!pick) return;
  const event = timeline.value.find((entry: any) => entry.key === pick.key);
  const step = event?.step ?? steps.value.find((s: any) => s.key === pick.key);
  if (!step) return;
  diffOnly.value = false;
  detail.value = step;
  open.value = false;
  solo.value = step;
});
// A call's result: in the run, or for a call made beside a question or a notice, in a later one.
const sessionResults = inject(toolResultsKey, null);
const resultOf = (callId: string) => steps.value.find((step: any) => step.kind === 'entry' && step.entry.payload?.tool_call_id === callId)
  ?? sessionResults?.value.get(callId) ?? null;
const summary = computed(() => summarizeSteps(steps.value, i18n.locale.value === 'zh'));
const icons = computed(() => stepIcons(steps.value));
const face = computed(() => chipFace(props.item, resultOf));

// What a step shows of itself in a line.
const preview = (s: any): string => {
  if (s.kind === 'entry') {
    const found = searchResults(s);
    if (found) return tr(`${found.results.length} 条结果 · ${found.provider_name}`, `${found.results.length} results · ${found.provider_name}`);
    const value = toolOutput(s);
    return firstLine(value?.path || value?.text || value?.message || (s.entry.payload?.content || []).map((b: any) => b.text || '').join('\n'), 120);
  }
  if (s.block?.type === 'tool_call') {
    const args = s.block.arguments ?? {};
    return firstLine(args.command || args.query || args.text || args.execution_id || args.path || args.operation || '', 120);
  }
  return firstLine(s.block?.text || '', 160);
};
// The timeline: thinking and calls in order. A call's result opens with it, and a search for it
// finds the call; a result with no call in the run stands on its own. A failure shows on the step.
// `tip` is what a rail node says of itself in one or two words: the act, never the reasoning's
// own words - those stay inside the window.
const called = computed(() => new Set(steps.value.filter((s: any) => s.block?.type === 'tool_call').map((s: any) => s.block.id)));
const timeline = computed(() => steps.value.flatMap((s: any) => {
  if (s.kind === 'entry') {
    if (called.value.has(s.entry.payload?.tool_call_id)) return [];
    const title = `${toolTitle(stepToolName(s))} · ${i18n.t('entry.toolResult')}`;
    return [{ key: s.key, step: s, seq: stepSeq(s), resultSeq: undefined, failed: stepFailed(s), thinking: false, icon: toolIcon(stepToolName(s)),
      title, tip: title, detail: preview(s) }];
  }
  if (s.block?.type === 'tool_call') {
    const result = resultOf(s.block.id);
    const title = toolTitle(stepToolName(s)) || '—';
    return [{ key: s.key, step: s, seq: stepSeq(s), resultSeq: result ? stepSeq(result) : undefined, failed: !!result && stepFailed(result), thinking: false,
      icon: toolIcon(stepToolName(s)), title, tip: title, detail: preview(s) }];
  }
  return [{ key: s.key, step: s, seq: stepSeq(s), resultSeq: undefined, failed: false, thinking: true, icon: '', title: preview(s) || i18n.t('entry.thinking'),
    tip: i18n.t('entry.thinking'), detail: '' }];
}));
// A call shown with its result.
const relatedResult = computed(() => detail.value?.block?.type === 'tool_call' ? resultOf(detail.value.block.id) : null);
const diffs = computed(() => steps.value.flatMap((step: any) => fileEdits(step).map((edit: any, index: number) => ({ step, edit, key: `${step.key}:${index}` })))
  .map((item: any) => ({ ...item, ...diffCounts(parseDiff(item.edit.diff ?? '')) })));
// A click on the run's own node - and a search that found it. One act opens its own window; a run
// of acts opens the list, whose every row then opens a window of its own.
function openNode() {
  const only = timeline.value.length === 1 ? timeline.value[0]! : null;
  if (only) {
    diffOnly.value = false;
    detail.value = only.step;
    open.value = false;
    solo.value = only.step;
    return;
  }
  solo.value = null;
  open.value = true;
}
// A search that found something in the run opens it the same way a click on its node would.
watch(() => props.forced, forced => { if (forced) openNode(); }, { immediate: true });
// A row of the list - or a file-changes card: its window rises as the list goes down.
function show(step: any, onlyDiff = false) {
  diffOnly.value = onlyDiff;
  detail.value = step;
  open.value = false;
  solo.value = step;
}
</script>

<template>
  <span class="history-chip-host">
    <!-- The rail's node: everything the run did, gathered. Its first step's place is where a
         search finds it; every step stays in the window below. -->
    <button v-if="variant === 'node'" type="button" class="history-rail-node" :class="{ failed: face.failed }"
      :aria-label="face.tip" aria-haspopup="dialog" :data-seq="face.seq" @click="openNode">
      <Icon :name="face.icon" />
      <span v-if="face.count > 1" class="history-rail-badge" aria-hidden="true">{{ face.count }}</span>
      <span class="history-rail-tip" aria-hidden="true">{{ face.tip }}</span>
    </button>
    <!-- A ghost hosts the window with no node: the rail's gathered node opens it instead. -->
    <button v-else-if="variant !== 'ghost'" type="button" class="history-chip icons" :title="summary" :aria-label="summary" aria-haspopup="dialog" @click="open = true">
      <Icon v-for="name in icons" :key="name" :name="name" />
    </button>
    <Modal :open="open" :sheet="isMobile" wide :title="summary" content-class="process-window" @close="open = false">
      <ol class="proc-timeline">
        <li v-for="event in timeline" :key="event.key" class="proc-event" :class="{ thinking: event.thinking, failed: event.failed }">
          <button type="button" class="proc-event-button" :class="{ current: detail?.key === event.key }" :data-seq="event.seq" :data-result-seq="event.resultSeq" @click="show(event.step)">
            <span class="proc-event-mark"><Icon v-if="event.icon" :name="event.icon" /></span>
            <span class="proc-event-text"><strong>{{ event.title }}</strong><small v-if="event.detail">{{ event.detail }}</small></span>
          </button>
        </li>
      </ol>
      <button v-for="change in diffs" :key="change.key" type="button" class="process-diff-card" @click="show(change.step, true)">
        <Icon name="file-diff" /><span>{{ change.edit.path }}<small>{{ tr('文件修改', 'File changes') }}</small></span><span v-if="change.edit.diff" class="process-diff-count"><b>+{{ change.added }}</b><b>−{{ change.removed }}</b></span><Icon name="chevron-right" />
      </button>
    </Modal>
    <!-- One step's own window: the list above has closed, so this is the only dialog up. -->
    <ProcessDetail v-if="solo" :step="solo" :related-result="relatedResult" :session="session" :diff-only="diffOnly" @close="solo = null" />
  </span>
</template>

<style scoped>
/* The timeline itself - its line, marks, rows - is shared with the activity rail's gathered
   window, and lives with the rest of the window styles in features.css. */
.process-diff-card { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; margin: 10px 0 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); color: var(--fg); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
@media (hover: hover) { .process-diff-card:hover { background: var(--bg-hover); } }
.process-diff-card > span:first-of-type { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.process-diff-card small { display: block; margin-top: 3px; color: var(--fg-subtle); font-size: 11px; }
.process-diff-card > .icon { flex: none; width: 16px; }
.process-diff-count { display: flex; gap: 8px; font-size: 12px; white-space: nowrap; }
.process-diff-count b:first-child { color: var(--ok); }
.process-diff-count b:last-child { color: var(--err); }
</style>
