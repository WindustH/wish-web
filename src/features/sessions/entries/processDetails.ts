import { extensionTool } from '../../../extensions/registry.ts';
import type { InjectionKey, Ref } from 'vue';
export function stepText(step: any): string {
  if (step.kind === 'entry')
    return (step.entry.payload?.content ?? []).map((block: any) => block.text ?? '').join('\n');
  if (step.block?.type === 'tool_call') return JSON.stringify(step.block.arguments ?? {}, null, 2);
  return step.block?.text ?? '';
}
export function toolResult(step: any): any {
  if (step.kind !== 'entry') return null;
  const value = step.entry.payload?.result;
  if (value !== undefined && typeof value !== 'string') return value;
  try {
    return JSON.parse(value ?? stepText(step));
  } catch {
    return null;
  }
}
export function toolOutput(step: any): any {
  const result = toolResult(step);
  if (result?.output !== undefined) return result.output;
  if (['shell', 'shell_edit'].includes(step.entry?.payload?.tool_name) && typeof result?.message === 'string') {
    try {
      const output = JSON.parse(result.message);
      if (output?.process) return output;
    } catch {}
  }
  return result;
}
/** Where a step stands in the history: its result entry's sequence, or the sequence its block came from. */
export const stepSeq = (step: any): number | undefined => (step.kind === 'entry' ? step.entry.seq : step.fromSeq);
/** The tool a step is about: the one a result answers, or the one a call names. */
export const stepToolName = (step: any): string | undefined =>
  step.kind === 'entry'
    ? step.entry.payload?.tool_name
    : step.block?.type === 'tool_call'
      ? step.block.name || step.block.tool_name
      : undefined;
/** What a web search step kept for the page - its provider and results - or null. */
export const searchResults = (step: any) =>
  step.kind === 'entry' &&
  step.entry.payload?.tool_name === 'web_search' &&
  Array.isArray(step.entry.payload?.metadata?.results)
    ? step.entry.payload.metadata
    : null;
// Built-in tools by the names people read, in English whatever the language; any other tool keeps its own.
const TOOL_TITLES: Record<string, string> = {
  shell_start: 'Run Command',
  shell_poll: 'Check Command',
  shell_write: 'Send Input',
  shell_kill: 'Stop Command',
  shell_edit: 'Edit Files',
  shell: 'Shell',
  task: 'Task',
  blob: 'Blob',
  session: 'Session',
  history_search: 'Search History',
  history_read: 'Read History',
  history_query: 'Query History',
  view_image: 'View Image',
  ask_user: 'Ask User',
  web_search: 'Web Search',
  web_fetch: 'Web Fetch',
};
export const toolTitle = (name?: string) => (name ? (extensionTool(name)?.title ?? TOOL_TITLES[name] ?? name) : '');
export function toolIcon(name?: string): string {
  const extension = extensionTool(name);
  if (extension) return extension.icon;
  // An edit reads as the change it makes: the diff mark, wherever the tool is shown - the rail,
  // a window's rows, a step's heading.
  if (name === 'shell_edit') return 'file-diff';
  if (name === 'task') return 'tasks';
  if (name === 'blob') return 'library';
  if (name === 'session') return 'users';
  if (name?.startsWith('shell')) return 'terminal';
  if (name === 'view_image') return 'image';
  if (name === 'history_search') return 'history-search';
  if (name === 'history_read') return 'history-read';
  if (name === 'history_query') return 'history-query';
  if (name === 'ask_user') return 'question';
  if (name === 'web_search') return 'web-search';
  if (name === 'web_fetch') return 'web-reader';
  return 'tool';
}
// The tools a run used, once per use: its calls, and the results it holds whose call came in an
// earlier run.
function toolsUsed(steps: any[]): string[] {
  const called = new Set(steps.filter((step) => step.block?.type === 'tool_call').map((step) => step.block.id));
  return steps
    .flatMap((step) =>
      step.block?.type === 'tool_call' || (step.kind === 'entry' && !called.has(step.entry.payload?.tool_call_id))
        ? [stepToolName(step) ?? '']
        : [],
    )
    .filter(Boolean);
}
/**
 * What a run of steps did, said in a line: "ran 3 commands, searched the web". A command's polls,
 * input and stop count with the command, or are said on their own when the run started none; tools
 * of their own are named; only thinking is said as such.
 */
export function summarizeSteps(steps: any[], zh: boolean): string {
  const calls = new Map<string, number>();
  for (const name of toolsUsed(steps)) calls.set(name, (calls.get(name) ?? 0) + 1);
  const count = (...names: string[]) => names.reduce((sum, name) => sum + (calls.get(name) ?? 0), 0);
  const files =
    new Set(steps.flatMap((step) => fileEdits(step).map((edit: any) => edit.path))).size || count('shell_edit');
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts: string[] = [];
  const commands = count('shell_start', 'shell');
  if (commands) parts.push(zh ? `运行了 ${commands} 条命令` : `ran ${plural(commands, 'command')}`);
  else {
    if (count('shell_poll')) parts.push(zh ? '查看了命令输出' : 'checked on a command');
    if (count('shell_write')) parts.push(zh ? '向命令发送了输入' : 'sent input to a command');
    if (count('shell_kill')) parts.push(zh ? '停止了命令' : 'stopped a command');
  }
  if (files) parts.push(zh ? `修改了 ${files} 个文件` : `edited ${plural(files, 'file')}`);
  const searches = count('web_search');
  if (searches)
    parts.push(
      zh
        ? searches === 1
          ? '搜索了网页'
          : `搜索了 ${searches} 次网页`
        : searches === 1
          ? 'searched the web'
          : `searched the web ${searches} times`,
    );
  const pages = count('web_fetch');
  if (pages) parts.push(zh ? `读取了 ${pages} 次网页` : `read webpages ${pages} ${pages === 1 ? 'time' : 'times'}`);
  if (count('session')) parts.push(zh ? '管理了会话与群组' : 'managed sessions and groups');
  if (count('task')) parts.push(zh ? '管理了命令任务' : 'managed command tasks');
  if (count('history_search', 'history_read', 'history_query'))
    parts.push(zh ? '查阅了会话历史' : 'looked through the history');
  const images = count('view_image');
  if (images) parts.push(zh ? `查看了 ${images} 张图片` : `viewed ${plural(images, 'image')}`);
  for (const name of ['image_generate', 'video_generate', 'audio_generate', 'audio_transcribe']) {
    const n = count(name);
    if (n)
      parts.push(
        zh ? `调用了 ${n} 次 ${toolTitle(name)}` : `used ${toolTitle(name)} ${n} ${n === 1 ? 'time' : 'times'}`,
      );
  }
  if (count('ask_user')) parts.push(zh ? '向你提问' : 'asked you');
  for (const name of calls.keys()) {
    if (
      name.startsWith('shell') ||
      name.startsWith('history_') ||
      [
        'image_generate',
        'video_generate',
        'audio_generate',
        'audio_transcribe',
        'web_search',
        'web_fetch',
        'task',
        'session',
        'view_image',
        'ask_user',
      ].includes(name)
    )
      continue;
    parts.push(zh ? `调用了 ${toolTitle(name)}` : `used ${toolTitle(name)}`);
  }
  if (!parts.length) return zh ? '思考了一会儿' : 'Thought it over';
  const line = parts.join(zh ? '、' : ', ');
  return zh ? line : line[0]!.toUpperCase() + line.slice(1);
}
/** The kinds of thing a run of steps did, as icons in the order they first came: a command, a file
 *  edited, the web searched... Only thinking shows as thinking. A few at most. */
export function stepIcons(steps: any[]): string[] {
  const icons: string[] = [];
  for (const name of toolsUsed(steps)) {
    const icon = name === 'shell_edit' ? 'file-diff' : toolIcon(name);
    if (!icons.includes(icon)) icons.push(icon);
  }
  return icons.length ? icons.slice(0, 4) : ['thinking'];
}
/** Whether a result says its tool failed: an error, or a command that exited otherwise than 0. */
export function stepFailed(step: any): boolean {
  const result = toolResult(step),
    output = toolOutput(step);
  return (
    result?.status === 'failed' ||
    extensionTool(stepToolName(step))?.failed?.(output) === true ||
    ['failed', 'killed'].includes(output?.process?.status) ||
    (output?.process?.exit_code != null && output.process.exit_code !== 0)
  );
}
/** The session's tool results by the call they answer, for a call whose result came in another run. */
export const toolResultsKey: InjectionKey<Ref<Map<string, any>>> = Symbol('tool results');
// Full diffs live in the result's metadata when the model did not ask to see them.
export interface FileEdit {
  path: string;
  diff?: string | null;
  changed?: boolean;
  binary?: boolean;
  status?: string;
  error?: string;
}
export function fileEdits(step: any): FileEdit[] {
  if (!['shell', 'shell_edit'].includes(step.entry?.payload?.tool_name)) return [];
  const edits = step.entry.payload?.metadata?.edits ?? toolOutput(step)?.edits;
  return Array.isArray(edits)
    ? edits.filter(
        (edit: unknown): edit is FileEdit =>
          !!edit &&
          typeof edit === 'object' &&
          'path' in edit &&
          typeof edit.path === 'string' &&
          (!('diff' in edit) || edit.diff == null || typeof edit.diff === 'string'),
      )
    : [];
}
export interface DiffLine {
  text: string;
  kind: 'add' | 'remove' | 'context' | 'meta';
  before: number | null;
  after: number | null;
}
/** How many lines a parsed diff adds and removes. */
export const diffCounts = (lines: DiffLine[]) => ({
  added: lines.filter((line) => line.kind === 'add').length,
  removed: lines.filter((line) => line.kind === 'remove').length,
});
export function parseDiff(diff: string): DiffLine[] {
  let before = 0,
    after = 0,
    inHunk = false;
  const lines = diff.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((text) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (match) {
      before = Number(match[1]);
      after = Number(match[2]);
      inHunk = true;
      return { text, kind: 'meta', before: null, after: null };
    }
    if (!inHunk || text.startsWith('\\')) return { text, kind: 'meta', before: null, after: null };
    if (text.startsWith('+')) return { text, kind: 'add', before: null, after: after++ };
    if (text.startsWith('-')) return { text, kind: 'remove', before: before++, after: null };
    if (text.startsWith(' ')) return { text, kind: 'context', before: before++, after: after++ };
    return { text, kind: 'meta', before: null, after: null };
  });
}
