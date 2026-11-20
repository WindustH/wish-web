// Tool families come from the extension registry so provider-specific tools use the same language as built-ins.
import { extensionTool } from '../../extensions/registry.ts';
import { tr } from '../../core/i18n/tr.ts';
import type { StreamState } from '../../core/state/chatStream.ts';
import { toolTitle } from './entries/processDetails.ts';

const actions = {
  search: ['搜索网页', 'Searching the web'],
  read: ['读取网页', 'Reading a web page'],
  image: ['生成图像', 'Generating an image'],
  editImage: ['编辑图像', 'Editing an image'],
  video: ['生成视频', 'Generating video'],
  audio: ['生成音频', 'Generating audio'],
  transcribe: ['转写音频', 'Transcribing audio'],
  shell: ['运行命令', 'Running a command'],
  edit: ['编辑文件', 'Editing a file'],
  history: ['读取会话历史', 'Reading session history'],
  question: ['打开问题', 'Preparing a question'],
  inspect: ['查看图像', 'Inspecting an image'],
  task: ['处理任务', 'Managing a task'],
  file: ['处理文件', 'Working with a file'],
  session: ['处理会话', 'Working with a session'],
  tool: ['调用工具', 'Running a tool'],
} as const;
type Action = keyof typeof actions;
export type WorkGlyphKind =
  Action | 'thinking' | 'writing' | 'working' | 'prepare' | 'waiting' | 'recovery' | 'compact' | 'stopped';
function toolAction(name: string): Action {
  const tags = extensionTool(name)?.tags ?? [];
  if (tags.includes('search') || name === 'web_search') return 'search';
  if (tags.includes('fetch') || name === 'web_fetch') return 'read';
  if (tags.includes('image')) return tags.includes('editing') && !tags.includes('generation') ? 'editImage' : 'image';
  if (tags.includes('video')) return 'video';
  if (tags.includes('transcription')) return 'transcribe';
  if (tags.includes('audio')) return 'audio';
  if (name === 'shell_edit') return 'edit';
  if (name.startsWith('shell')) return 'shell';
  if (name.startsWith('history_')) return 'history';
  return (
    (
      { ask_user: 'question', view_image: 'inspect', task: 'task', blob: 'file', session: 'session' } as Record<
        string,
        Action
      >
    )[name] ?? 'tool'
  );
}
function toolSubject(action: Action, args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  if (action === 'read' && typeof args.url === 'string') {
    try {
      return new URL(args.url).hostname;
    } catch {
      return '';
    }
  }
  const text =
    action === 'search'
      ? (args.query ?? (Array.isArray(args.queries) ? args.queries[0] : ''))
      : action === 'edit' || action === 'file'
        ? args.path
        : args.model;
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}
export function workActivity(
  state: StreamState,
  waiting: boolean,
): { glyph: WorkGlyphKind; label: string; detail?: string } {
  if (waiting) return { glyph: 'waiting', label: tr('等待你回答', 'Waiting for your answer') };
  if (state.recovery)
    return {
      glyph: 'recovery',
      label: tr('正在恢复生成', 'Resuming generation'),
      detail: tr('第 ' + state.recovery.attempt + ' 次尝试', 'Attempt ' + state.recovery.attempt),
    };
  if (state.currentTool && (state.activity === 'preparingTool' || state.activity === 'tool')) {
    const name = state.currentTool;
    const title = toolTitle(name);
    if (state.activity === 'preparingTool')
      return { glyph: 'prepare', label: tr('正在准备工具参数', 'Preparing tool arguments'), detail: title };
    const action = toolAction(name),
      [zh, en] = actions[action];
    const active = state.runningTools ?? [];
    const subject = toolSubject(action, active.at(-1)?.args);
    const extra =
      active.length > 1 ? tr('另有 ' + (active.length - 1) + ' 项运行中', active.length - 1 + ' more running') : '';
    return { glyph: action, label: tr('正在' + zh, en), detail: [subject || title, extra].filter(Boolean).join(' · ') };
  }
  if (state.activity === 'thinking')
    return { glyph: 'thinking', label: tr('正在推理', 'Reasoning through the request') };
  if (state.activity === 'writing') return { glyph: 'writing', label: tr('正在撰写回复', 'Writing the reply') };
  return { glyph: 'working', label: tr('等待模型响应', 'Waiting for the model') };
}
