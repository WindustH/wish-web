// What one chip - a run of steps, or a notice the transcript left - puts on the activity rail:
// the first act's icon, how many things it did, whether anything went wrong, where a search finds
// it, and what it is called in a word or two. The notice faces are shared with SystemEntry's own
// drawing, so the rail and the notice itself can never disagree.
import { i18n } from '../../../core/i18n/index.ts';
import { stepFailed, stepToolName, summarizeSteps, toolIcon, toolTitle } from './processDetails.ts';

// Transcript notices come in two severities plus the neutral system face: red = a turn failed
// outright (wish_run_failed), amber = the backend is handling a problem by itself.
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

export const noticeTone = (entry: any): 'error' | 'warn' | 'system' =>
  entry.payload?.source === 'wish_run_failed' ? 'error' : WARN_SOURCES.has(entry.payload?.source ?? '') ? 'warn' : 'system';

/** Whether a background command's notice tells of its death: killed, errored, or exited otherwise than 0. */
export function noticeFailed(entry: any): boolean {
  const output = entry.payload?.result?.output;
  return output?.process?.status === 'killed' || !!output?.error || !!output?.process?.error
    || (output?.process?.exit_code != null && output.process.exit_code !== 0);
}

/** What a notice is called, in the words its own window is titled with. */
export function noticeLabel(entry: any): string {
  if (entry.payload?.background) {
    const output = entry.payload.result?.output;
    const zh = i18n.locale.value === 'zh';
    if (output?.process?.status === 'killed') return zh ? '后台 Shell 已终止' : 'Background shell terminated';
    if (noticeFailed(entry)) return zh ? '后台 Shell 执行失败' : 'Background shell failed';
    return zh ? '后台 Shell 已完成' : 'Background shell completed';
  }
  if (entry.kind === 'developer_message') return 'Developer Message';
  return i18n.t(entry.kind === 'background_terminal' ? 'entry.backgroundTerminal' : SOURCE_LABELS[entry.payload?.source ?? ''] ?? 'entry.system');
}

export const noticeIconName = (entry: any): string => {
  if (entry.payload?.background) return 'terminal';
  const tone = noticeTone(entry);
  return tone === 'system' ? 'circle-dot' : tone === 'error' ? 'x' : 'triangle-alert';
};

export interface ChipFace { icon: string; count: number; failed: boolean; warn: boolean; seq: number | undefined; tip: string }

/** Where a call's result is for the merge below: in the run, or in a later one the session kept. */
export function resultLookup(chip: any, sessionResults?: Map<string, any> | null) {
  const steps: any[] = chip?.type === 'process' ? chip.steps ?? [] : [];
  return (callId: string) => steps.find(step => step.kind === 'entry' && step.entry.payload?.tool_call_id === callId)
    ?? sessionResults?.get(callId) ?? null;
}

/** A chip as one rail node: its first act as the icon, its events as the count badge, the worst
 *  that happened as its colour, its first event's place as the search anchor, and a one-line
 *  saying of what it did. A result rides the call it answers and takes no event of its own. */
export function chipFace(chip: any, resultOf: (callId: string) => any): ChipFace {
  if (chip.type !== 'process') {
    const entry = chip.entry ?? {};
    return { icon: noticeIconName(entry), count: 1, failed: noticeFailed(entry) || noticeTone(entry) === 'error',
      warn: noticeTone(entry) === 'warn', seq: entry.seq, tip: noticeLabel(entry) };
  }
  const steps: any[] = chip.steps ?? [];
  const called = new Set(steps.filter(step => step.block?.type === 'tool_call').map(step => step.block.id));
  const events = steps.filter(step => !(step.kind === 'entry' && called.has(step.entry?.payload?.tool_call_id)));
  const failed = events.some(step => step.kind === 'entry' ? stepFailed(step)
    : step.block?.type === 'tool_call' ? (() => { const result = resultOf(step.block.id); return !!result && stepFailed(result); })()
    : false);
  const first = events[0];
  const icon = first && (first.kind === 'entry' || first.block?.type === 'tool_call')
    ? toolIcon(stepToolName(first)) : 'thinking';
  return { icon, count: events.length, failed, warn: false, seq: first ? (first.kind === 'entry' ? first.entry.seq : first.fromSeq) : undefined,
    tip: summarizeSteps(steps, i18n.locale.value === 'zh') };
}

export interface ChipEvent { key: string; step: any; icon: string; title: string; failed: boolean }

/** A run's steps as list rows, in the order they came: what a gathered node opens, one line per
 *  thing done. The titles are acts, never the reasoning's own words. A result rides its call. */
export function chipEvents(chip: any, resultOf: (callId: string) => any): ChipEvent[] {
  if (chip.type !== 'process') return [];
  const steps: any[] = chip.steps ?? [];
  const called = new Set(steps.filter(step => step.block?.type === 'tool_call').map(step => step.block.id));
  return steps.flatMap(step => {
    if (step.kind === 'entry') {
      if (called.has(step.entry.payload?.tool_call_id)) return [];
      return [{ key: step.key, step, icon: toolIcon(stepToolName(step)),
        title: `${toolTitle(stepToolName(step))} · ${i18n.t('entry.toolResult')}`, failed: stepFailed(step) }];
    }
    if (step.block?.type === 'tool_call') {
      const result = resultOf(step.block.id);
      return [{ key: step.key, step, icon: toolIcon(stepToolName(step)),
        title: toolTitle(stepToolName(step)) || '—', failed: !!result && stepFailed(result) }];
    }
    return [{ key: step.key, step, icon: 'thinking', title: i18n.t('entry.thinking'), failed: false }];
  });
}
