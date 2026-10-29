import { argumentsView, imageResult, transcriptResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'siliconflow_image', title: 'SiliconFlow Image', icon: 'image', tags: ['image', 'generation'] },
    invocation: argumentsView,
    result: imageResult,
  },
  {
    ...{
      name: 'siliconflow_transcribe',
      title: 'SiliconFlow Transcribe',
      icon: 'mic',
      tags: ['audio', 'asr', 'transcription'],
    },
    invocation: argumentsView,
    result: transcriptResult,
  },
] satisfies ExtensionToolPresentation[];
