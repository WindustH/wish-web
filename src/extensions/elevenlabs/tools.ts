import { mediaFailed, argumentsView, mediaResult, transcriptResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'elevenlabs_speech', title: 'ElevenLabs Speech', icon: 'audio', tags: ['audio', 'speech'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
  {
    ...{ name: 'elevenlabs_sound', title: 'ElevenLabs Sound', icon: 'audio', tags: ['audio', 'sound'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
  {
    ...{ name: 'elevenlabs_music', title: 'ElevenLabs Music', icon: 'audio', tags: ['audio', 'music'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
  {
    ...{
      name: 'elevenlabs_transcribe',
      title: 'ElevenLabs Transcribe',
      icon: 'mic',
      tags: ['audio', 'asr', 'transcription'],
    },
    invocation: argumentsView,
    result: transcriptResult,
  },
] satisfies ExtensionToolPresentation[];
