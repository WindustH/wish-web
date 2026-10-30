// Local-only gallery data. No API calls, live session ids, credentials or external images.
import { groupEntries } from '../../domain/chat/grouping.ts';
import { entryView } from '../../core/api/projections.ts';
export type PreviewCategory = 'files' | 'messages' | 'tools' | 'sessions';
export interface StyleSample {
  id: string;
  category: PreviewCategory;
  zh: string;
  en: string;
  kind: 'files' | 'history' | 'process' | 'group' | 'retry';
  item: any;
}
const diff =
  '@@ -1,2 +1,3 @@\n-export const enabled = false;\n+export const enabled = true;\n+// Continue unfinished work.\n export const name = "Wish";';
const edit = (path: string) => ({ path, changed: true, status: 'complete', diff });
function files(id: string, paths: string[]) {
  return {
    type: 'process',
    key: id,
    steps: [
      {
        key: `${id}-result`,
        kind: 'entry',
        entry: {
          seq: 1,
          kind: 'tool_result',
          payload: { tool_name: 'shell', result: { status: 'success' }, metadata: { edits: paths.map(edit) } },
        },
      },
    ],
  };
}
function tool(id: string, name: string, args: any, result?: any) {
  const steps: any[] = [
    { key: `${id}-call`, kind: 'block', fromSeq: 1, block: { type: 'tool_call', id, name, arguments: args } },
  ];
  if (result)
    steps.push({
      key: `${id}-result`,
      kind: 'entry',
      entry: { seq: 2, kind: 'tool_result', payload: { tool_name: name, tool_call_id: id, result } },
    });
  return { type: 'process', key: id, steps };
}
const success = (output: any) => ({ status: 'success', output });
export function stylePreviewFixtures(): StyleSample[] {
  const group = { id: 'preview-only', name: 'Wish 开发协作 · Development' };
  const samples: StyleSample[] = [
    {
      id: 'retry-waiting',
      category: 'messages',
      zh: '连接重试 · 等待重试',
      en: 'Connection retry · Waiting',
      kind: 'retry',
      item: [
        {
          requestId: 'preview-retry-waiting',
          operation: 'model',
          phase: 'waiting',
          retry: 2,
          maxRetries: 5,
          retryAt: Date.now() + 10_000,
          failure: {
            family: 'Transport',
            message: '连接暂时中断，等待重新请求。\nConnection reset while waiting for response headers.',
          },
        },
      ],
    },
    {
      id: 'retry-attempting',
      category: 'messages',
      zh: '连接重试 · 已重新请求',
      en: 'Connection retry · Request sent',
      kind: 'retry',
      item: [
        {
          requestId: 'preview-retry-attempting',
          operation: 'web_fetch',
          phase: 'attempting',
          retry: 1,
          maxRetries: 3,
          retryAt: 0,
          failure: {
            family: 'Transport',
            message: '上次请求等待响应超时。\nThe previous request timed out before response headers arrived.',
          },
        },
      ],
    },
    {
      id: 'one-file',
      category: 'files',
      zh: '单文件修改',
      en: 'Single file',
      kind: 'files',
      item: files('one-file', ['src/config.ts']),
    },
    {
      id: 'three-files',
      category: 'files',
      zh: '三个独立卡片 / 长路径',
      en: 'Three cards / long path',
      kind: 'files',
      item: files('three-files', [
        'src/features/settings/preview/a-very-long-component-name-for-layout-testing.vue',
        'src/config.ts',
        'README.md',
      ]),
    },
    {
      id: 'stacked-files',
      category: 'files',
      zh: '六个文件堆叠',
      en: 'Six stacked files',
      kind: 'files',
      item: files('stacked-files', [
        'test_wish_server.py',
        'compaction.md',
        'input-preemption-audit.md',
        'provider.rs',
        'ToolSettings.vue',
        'config.ts',
      ]),
    },
    {
      id: 'user',
      category: 'messages',
      zh: '用户消息',
      en: 'User message',
      kind: 'history',
      item: {
        type: 'entry',
        entry: {
          kind: 'user_message',
          payload: {
            content: [
              { type: 'text', text: '请检查卡片的边距、换行和颜色。\nPlease check spacing, wrapping and colors.' },
            ],
          },
        },
      },
    },
    {
      id: 'assistant',
      category: 'messages',
      zh: '助手消息 / Markdown',
      en: 'Assistant / Markdown',
      kind: 'history',
      item: {
        type: 'entry',
        entry: { kind: 'assistant_message' },
        blocks: [
          {
            type: 'text',
            text: '### 样式预览 · Preview\n\n这里是 **粗体**、*斜体* 和 `inline code`。\n\n- 检查多行文字\n- 检查列表间距\n\n```ts\nconst preview = true;\n```\n\n| 状态 | Result |\n| --- | --- |\n| 完成 | Passed |',
          },
        ],
      },
    },
    {
      id: 'error',
      category: 'messages',
      zh: '回复失败',
      en: 'Reply failure',
      kind: 'history',
      item: {
        type: 'entry',
        entry: {
          kind: 'run_error',
          payload: { failure: { family: 'Transport', message: 'read body: no body chunk within the idle limit' } },
        },
      },
    },
    {
      id: 'shell-success',
      category: 'tools',
      zh: '命令成功',
      en: 'Command succeeded',
      kind: 'process',
      item: tool(
        'shell-success',
        'shell',
        { command: 'printf "Preview only"' },
        success({ text: 'Preview only\nAll 8 checks passed.', process: { status: 'exited', exit_code: 0 } }),
      ),
    },
    {
      id: 'shell-running',
      category: 'tools',
      zh: '命令执行中',
      en: 'Command running',
      kind: 'process',
      item: tool('shell-running', 'shell', { command: 'build --preview' }),
    },
    {
      id: 'shell-failed',
      category: 'tools',
      zh: '命令失败',
      en: 'Command failed',
      kind: 'process',
      item: tool(
        'shell-failed',
        'shell',
        { command: 'check --preview' },
        { status: 'failed', message: 'Example check failed; no command was executed.' },
      ),
    },
    {
      id: 'session-create',
      category: 'sessions',
      zh: 'Session：创建会话',
      en: 'Session: create',
      kind: 'process',
      item: tool(
        'session-create',
        'session',
        { action: 'create', input: { name: '审查助手' } },
        success({ session: { id: 'preview-session', name: '审查助手' } }),
      ),
    },
    {
      id: 'session-send',
      category: 'sessions',
      zh: 'Session：发送群消息',
      en: 'Session: send',
      kind: 'process',
      item: tool(
        'session-send',
        'session',
        { action: 'send', target: group.name, text: '实现已完成，请协助审查。' },
        success({ group, woken: ['preview-reviewer', 'preview-tester'] }),
      ),
    },
    {
      id: 'session-denied',
      category: 'sessions',
      zh: 'Session：操作被拒绝',
      en: 'Session: denied',
      kind: 'process',
      item: tool(
        'session-denied',
        'session',
        { action: 'send', target: 'Restricted group' },
        { status: 'failed', message: 'Session access denied (preview).' },
      ),
    },
    {
      id: 'group-received',
      category: 'sessions',
      zh: '收到群消息',
      en: 'Received group message',
      kind: 'group',
      item: {
        author: { name: '审查助手 · Reviewer', color: 'var(--ok)' },
        verb: '在 / in',
        group,
        text: '### 审查结果\n\n实现已检查，建议补充 **移动端换行测试**。\n\n- 普通卡片\n- 堆叠卡片\n- 群消息详情',
        note: '2 个文件 / 2 files',
      },
    },
    {
      id: 'group-sent',
      category: 'sessions',
      zh: '已发送群消息 / 唤醒成员',
      en: 'Sent / members woken',
      kind: 'group',
      item: {
        verb: '发到 / Sent to',
        group,
        text: '测试已通过，请继续审查。\n\nChecks passed; please continue the review.',
        note: '唤醒了 2 个成员 / Woke 2 members',
      },
    },
    {
      id: 'group-long',
      category: 'sessions',
      zh: '长群消息 / 无其他成员',
      en: 'Long message / no peers',
      kind: 'group',
      item: {
        verb: '发到 / Sent to',
        group,
        text: Array.from(
          { length: 12 },
          (_, i) => `${i + 1}. 这是用于检查截断和展开效果的长消息。 Long preview message.`,
        ).join('\n'),
        note: '群里没有其他会话 / No other session there',
      },
    },
  ];
  const project = (id: number, message: any) =>
    entryView(
      { record: { sequence: id, recorded_at: 0 }, content: { kind: 'message', value: { id, message } } },
      'preview-only',
    );
  const question = groupEntries([
    project(1, {
      ToolUse: {
        call_id: 'preview-answer',
        name: 'ask_user',
        arguments: { questions: [{ type: 'text', question: '你更喜欢哪种卡片样式？' }] },
      },
    }),
    project(2, {
      ToolResult: {
        call_id: 'preview-answer',
        name: 'ask_user',
        content: success({ status: 'answered', answers: [{ text: '当前的紧凑样式。' }] }),
      },
    }),
  ])[0];
  samples.push({
    id: 'question',
    category: 'messages',
    zh: '已回答的问题',
    en: 'Answered question',
    kind: 'history',
    item: question,
  });
  return samples;
}
