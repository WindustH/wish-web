import { tr } from '../../core/i18n/tr.ts';
import { diffCounts, parseDiff, resultOutput } from './entries/processDetails.ts';

/** Plain stored content, without Markdown rendering or display-summary substitution. */
export function generationText(message: Record<string, any>): string {
  const [role, value] = Object.entries(message)[0] ?? ['', {}];
  const json = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (role === 'ToolUse') return `${value.name}\ncall_id: ${value.call_id}\n\n${json(value.arguments)}`;
  if (role === 'ToolResult') return `${value.name}\ncall_id: ${value.call_id}\n\n${json(value.content)}`;
  if (Array.isArray(value.content))
    return value.content.map((block: any) => (block.Text ? block.Text.text : json(block))).join('\n\n');
  if (role === 'Reasoning')
    return ['plaintext', 'display', 'signature', 'ciphertext', 'opaque_kind', 'replay_item']
      .filter((key) => value[key] != null && value[key] !== '')
      .map((key) => `${key}:\n${json(value[key])}`)
      .join('\n\n');
  if (role === 'UpstreamCompaction') return json(value);
  return json(value);
}

/** Stored execution data and the protocol's model-facing text, without UI-only metadata. */
export function generationToolResult(message: Record<string, any>) {
  const result = message.ToolResult;
  if (!result) return null;
  const content = result.content;
  const projected =
    content !== null &&
    typeof content === 'object' &&
    (typeof content.model_text === 'string' || Object.hasOwn(content, 'model_value'));
  const execution = projected
    ? Object.fromEntries(Object.entries(content).filter(([key]) => key !== 'model_text' && key !== 'model_value'))
    : content;
  const text = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return {
    execution: text(execution),
    model: text(modelResultValue(content)),
    projected,
  };
}
function modelResultValue(content: any): unknown {
  if (content && typeof content === 'object') {
    if (Object.hasOwn(content, 'model_value')) return content.model_value;
    if (typeof content.model_text === 'string') return content.model_text;
  }
  return content;
}

function firstLine(value: unknown): string {
  return typeof value === 'string' ? (value.match(/\S[^\r\n]*/)?.[0].trimEnd() ?? '') : '';
}

export function commandPreview(command: string, directory = '') {
  if (!directory) return command;
  for (const path of [directory, `'${directory}'`, `"${directory}"`]) {
    if (!command.startsWith(`cd ${path}`)) continue;
    const rest = command.slice(path.length + 3);
    if (/^\s*(?:&&|;)/.test(rest)) return rest.replace(/^\s*(?:&&|;)\s*/, '');
  }
  return command;
}

function summaryFields(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value)
    .filter(([, field]) => ['boolean', 'number', 'string'].includes(typeof field))
    .slice(0, 3)
    .map(([key, field]) => `${key}=${String(field).slice(0, 96)}`)
    .join(' · ');
}

export function generationToolSummary(message: Record<string, any>, directory?: string) {
  const invocation = message.ToolUse;
  const result = message.ToolResult;
  const tool = invocation ?? result;
  if (!tool) return null;
  const name: string = tool.name ?? '';
  if (invocation) {
    const args = invocation.arguments;
    const preview =
      typeof args?.command === 'string'
        ? commandPreview(args.command, directory)
        : firstLine(args?.query ?? args?.path ?? args?.url) || summaryFields(args);
    return { name, preview, status: '', failed: false };
  }
  const content = result.content;
  const execution = resultOutput(content, name);
  const exit = execution?.process?.exit_code;
  const state = execution?.process?.status;
  const failed =
    content?.status === 'failed' || (typeof exit === 'number' && exit !== 0) || ['failed', 'killed'].includes(state);
  const stateLabels: Record<string, string> = {
    running: tr('运行中', 'Running'),
    cancelled: tr('已取消', 'Cancelled'),
    interrupted: tr('已中止', 'Interrupted'),
    unknown: tr('状态未知', 'Unknown'),
  };
  const status =
    typeof exit === 'number'
      ? `exit ${exit}`
      : failed
        ? tr('失败', 'Failed')
        : (stateLabels[state ?? content?.status] ?? '');
  let model: any = modelResultValue(content);
  if (typeof model === 'string' && model.length < 262_144 && /^\s*\{/.test(model)) {
    try {
      model = JSON.parse(model);
    } catch {
      // Plain output can start with a brace too.
    }
  }
  const output = resultOutput(model, name);
  let preview = firstLine(model);
  if (typeof model !== 'string') {
    preview =
      firstLine(output?.text) ||
      firstLine(output?.stdout) ||
      firstLine(output?.stderr) ||
      firstLine(output?.summary ?? output?.message ?? output?.error) ||
      firstLine(model?.message ?? model?.error) ||
      firstLine(output?.path ?? output?.query ?? output?.url) ||
      firstLine(output);
    if (name === 'shell_edit' && Array.isArray(output?.edits) && output.edits.length) {
      const edit = output.edits[0];
      if (typeof edit?.path === 'string') {
        const counts = typeof edit.diff === 'string' ? diffCounts(parseDiff(edit.diff)) : null;
        preview = edit.path + (counts ? ` +${counts.added}/−${counts.removed}` : '');
      }
    } else if (Array.isArray(output?.results)) {
      const count = output.results.length;
      preview = [preview, tr(`${count} 条结果`, `${count} results`)].filter(Boolean).join(' · ');
    }
    if (!preview && !name.startsWith('shell')) preview = summaryFields(output);
  }
  return { name, preview: preview || tr('无输出', 'No output'), status, failed };
}

export function generationMessagePreview(message: Record<string, any>, directory?: string) {
  const [role, value] = Object.entries(message)[0] ?? ['', {}];
  if (role === 'Reasoning') return value.display || value.plaintext || '';
  if (role === 'UpstreamCompaction') return '';
  const text = generationText(message);
  if (role === 'Developer') {
    const background = /^Background task \S+ finished\. Command: ([\s\S]+)/.exec(text);
    if (background)
      return `${tr('后台任务完成', 'Background task completed')} · ${commandPreview(background[1]!, directory)}`;
  }
  if (role !== 'Assistant' && role !== 'User') return text;
  return text
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
    .replace(/!?\[([^\]]+)\]\([^\n)]*\)/g, '$1')
    .replace(/`+|\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const encoder = new TextEncoder();
export function generationMessageBytes(message: Record<string, any>) {
  const value = message.ToolResult ? modelResultValue(message.ToolResult.content) : message;
  return encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;
}
