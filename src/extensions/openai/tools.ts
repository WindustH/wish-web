import {
  mediaFailed,
  argumentsView,
  imageResult,
  mediaResult,
  transcriptResult,
  webResult,
} from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'openai_search', title: 'OpenAI Search', icon: 'web-search', tags: ['web', 'search'] },
    invocation: argumentsView,
    result: webResult,
  },
  {
    ...{ name: 'openai_speech', title: 'OpenAI Speech', icon: 'audio', tags: ['audio', 'speech'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
  {
    ...{ name: 'openai_fetch', title: 'OpenAI Fetch', icon: 'web-reader', tags: ['web', 'fetch', 'reader'] },
    invocation: argumentsView,
    result: webResult,
  },
  {
    ...{
      name: 'openai_image',
      title: 'OpenAI Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
    },
    invocation: argumentsView,
    result: imageResult,
  },
  {
    ...{ name: 'openai_transcribe', title: 'OpenAI Transcribe', icon: 'mic', tags: ['audio', 'asr', 'transcription'] },
    invocation: argumentsView,
    result: transcriptResult,
  },
  {
    ...{ name: 'chatgpt_image', title: 'ChatGPT Image', icon: 'image', tags: ['image', 'generation'] },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
