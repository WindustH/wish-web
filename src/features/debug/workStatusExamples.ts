import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { createEmptyStream, type StreamState } from '../../core/state/chatStream.ts';
import { workActivity, type WorkGlyphKind } from '../sessions/workActivity.ts';

export function workStatusExamples() {
  const base = createEmptyStream();
  const state = (patch: Partial<StreamState> = {}, waiting = false) => workActivity({ ...base, ...patch }, waiting);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    state({
      activity: 'tool',
      currentTool: name,
      runningTools: [{ id: 'sample', name, args }],
    });
  return {
    working: state(),
    thinking: state({ activity: 'thinking' }),
    writing: state({ activity: 'writing' }),
    prepare: state({ activity: 'preparingTool', currentTool: 'openai_search' }),
    search: call('openai_search', { query: tr('月球地图', 'Lunar maps') }),
    read: call('web_fetch', { url: 'https://science.nasa.gov/moon/' }),
    image: call('image_generate'),
    editImage: call('bfl_fill'),
    video: call('video_generate'),
    audio: call('audio_generate'),
    transcribe: call('audio_transcribe'),
    shell: call('shell'),
    edit: call('shell_edit', { path: 'src/main.ts' }),
    history: call('history_read'),
    question: call('ask_user'),
    waiting: state({}, true),
    inspect: call('view_image'),
    task: call('task'),
    file: call('blob'),
    session: call('session'),
    tool: call('custom_lookup'),
    recovery: state({ recovery: { attempt: 2, delayMs: 1000 } }),
    compact: { glyph: 'compact', label: i18n.t('chat.compacting') },
    stopped: { glyph: 'stopped', label: i18n.t('chat.resumeHint', { n: 1 }) },
  } satisfies Record<WorkGlyphKind, ReturnType<typeof workActivity>>;
}
