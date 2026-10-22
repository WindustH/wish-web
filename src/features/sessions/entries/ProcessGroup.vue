<script setup lang="ts">
// A run of steps - thinking, tool calls and their results - on a compact rail; what it did in words ("ran 3 commands, searched the
// web") is its label and its window's title. It opens the run as a timeline: a card sliding up on a
// phone, a window on a desktop. Each step opens to show all of it.
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

const props = defineProps<{ item: any; forced?: boolean; session?: string; rail?: boolean }>();
const isMobile = useIsMobile();
const steps = computed(() => props.item.steps ?? []);
// The window and the step open in it outlast this button: the button moves into the reply that
// comes after the run, and rows come and go as the log scrolls.
const open = ref(!!props.session && expandedBefore(props.session, props.item.key));
const kept = props.session ? stepBefore(props.session, props.item.key) : undefined;
const detail = ref<any>(kept ? steps.value.find((step: any) => step.key === kept.key) ?? null : null);
const diffOnly = ref(kept?.diffOnly ?? false);
watch(open, value => { if (props.session) setExpanded(props.session, props.item.key, value); });
watch([detail, diffOnly], ([step, only]) => { if (props.session) setStep(props.session, props.item.key, step ? { key: step.key, diffOnly: only } : undefined); });
// A search that found something in the run opens it.
watch(() => props.forced, forced => { if (forced) open.value = true; }, { immediate: true });
// A call's result: in the run, or for a call made beside a question or a notice, in a later one.
const sessionResults = inject(toolResultsKey, null);
const resultOf = (callId: string) => steps.value.find((step: any) => step.kind === 'entry' && step.entry.payload?.tool_call_id === callId)
  ?? sessionResults?.value.get(callId) ?? null;
const summary = computed(() => summarizeSteps(steps.value, i18n.locale.value === 'zh'));
const icons = computed(() => stepIcons(steps.value));

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
function openStep(step: any) { open.value = true; show(step); }
function show(step: any, onlyDiff = false) {
  diffOnly.value = onlyDiff;
  detail.value = step;
}
</script>

<template>
  <span class="history-chip-host" :class="{ 'history-rail-process': rail }">
    <template v-if="rail">
      <button v-for="event in timeline.slice(0, 4)" :key="event.key" type="button" class="history-rail-node"
        :class="{ failed: event.failed }" :aria-label="event.tip" aria-haspopup="dialog" :data-seq="event.seq" :data-result-seq="event.resultSeq" @click="openStep(event.step)">
        <Icon :name="event.icon || 'thinking'" /><span class="history-rail-tip" aria-hidden="true">{{ event.tip }}</span>
      </button>
      <button v-if="timeline.length > 4" type="button" class="history-rail-node history-rail-more" :aria-label="tr(`还有 ${timeline.length - 4} 个步骤`, `${timeline.length - 4} more steps`)" aria-haspopup="dialog" @click="open = true">
        +{{ timeline.length - 4 }}<span class="history-rail-tip" aria-hidden="true">{{ summary }}</span>
      </button>
    </template>
    <button v-else type="button" class="history-chip icons" :title="summary" :aria-label="summary" aria-haspopup="dialog" @click="open = true">
      <Icon v-for="name in icons" :key="name" :name="name" />
    </button>
    <Modal :open="open" :sheet="isMobile" wide :title="summary" content-class="process-window" @close="open = false">
      <ol class="proc-timeline">
        <li v-for="event in timeline" :key="event.key" class="proc-event" :class="{ thinking: event.thinking, failed: event.failed }">
          <button type="button" class="proc-event-button" :data-seq="event.seq" :data-result-seq="event.resultSeq" @click="show(event.step)">
            <span class="proc-event-mark"><Icon v-if="event.icon" :name="event.icon" /></span>
            <span class="proc-event-text"><strong>{{ event.title }}</strong><small v-if="event.detail">{{ event.detail }}</small></span>
          </button>
        </li>
      </ol>
      <button v-for="change in diffs" :key="change.key" type="button" class="process-diff-card" @click="show(change.step, true)">
        <Icon name="file-diff" /><span>{{ change.edit.path }}<small>{{ tr('文件修改', 'File changes') }}</small></span><span v-if="change.edit.diff" class="process-diff-count"><b>+{{ change.added }}</b><b>−{{ change.removed }}</b></span><Icon name="chevron-right" />
      </button>
      <ProcessDetail v-if="detail" :step="detail" :related-result="relatedResult" :session="session" :diff-only="diffOnly" @close="detail = null" />
    </Modal>
  </span>
</template>

<style scoped>
/* The timeline: each step's mark on a thin line, its title and one line of what it did beside. */
.proc-timeline { position: relative; display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.proc-timeline::before { content: ''; position: absolute; top: 14px; bottom: 14px; left: 15px; border-left: 1px solid var(--line); }
.proc-event-button { position: relative; display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 6px 8px 6px 2px; border: 0; border-radius: 8px; background: none; color: var(--fg); font: inherit; text-align: left; cursor: pointer; }
@media (hover: hover) { .proc-event-button:hover { background: var(--bg-hover); } }
.proc-event-mark { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg-overlay); color: var(--fg-muted); }
.proc-event-mark .icon { width: 15px; height: 15px; }
.proc-event.thinking .proc-event-mark { border: 0; background: none; }
.proc-event.thinking .proc-event-mark::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--fg-faint); }
.proc-event-text { display: grid; gap: 2px; min-width: 0; padding-top: 3px; }
.proc-event-text strong { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.proc-event.thinking .proc-event-text strong { color: var(--fg-muted); font-weight: 400; }
.proc-event.failed .proc-event-text strong, .proc-event.failed .proc-event-mark { color: var(--err); }
.proc-event-text small { color: var(--fg-subtle); font-size: 12.5px; line-height: 1.5; overflow-wrap: anywhere; display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.process-diff-card { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; margin: 10px 0 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); color: var(--fg); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
@media (hover: hover) { .process-diff-card:hover { background: var(--bg-hover); } }
.process-diff-card > span:first-of-type { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.process-diff-card small { display: block; margin-top: 3px; color: var(--fg-subtle); font-size: 11px; }
.process-diff-card > .icon { flex: none; width: 16px; }
.process-diff-count { display: flex; gap: 8px; font-size: 12px; white-space: nowrap; }
.process-diff-count b:first-child { color: var(--ok); }
.process-diff-count b:last-child { color: var(--err); }
</style>
