import tools from './tools.ts';
import type { ExtensionPresentation } from '../types.ts';
export default {
  id: 'elevenlabs',
  settings: ['audio_generation', 'audio_transcription'],
  tools,
} satisfies ExtensionPresentation;
