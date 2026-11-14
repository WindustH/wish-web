import { argumentsView, webResult, mediaResult, mediaFailed, transcriptResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    name: 'deepseek_speech',
    title: 'DeepSeek Speech',
    icon: 'audio',
    tags: ['audio', 'speech', 'tts', 'generation'],
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
  {
    name: 'deepseek_transcribe',
    title: 'DeepSeek Transcribe',
    icon: 'mic',
    tags: ['audio', 'asr', 'transcription', 'speech-to-text'],
    invocation: argumentsView,
    result: transcriptResult,
  },
  {
    ...{ name: 'deepseek_search', title: 'DeepSeek Search', icon: 'web-search', tags: ['web', 'search'] },
    invocation: argumentsView,
    result: webResult,
  },
  {
    ...{ name: 'deepseek_fetch', title: 'DeepSeek Fetch', icon: 'web-reader', tags: ['web', 'fetch', 'reader'] },
    invocation: argumentsView,
    result: webResult,
  },
] satisfies ExtensionToolPresentation[];
