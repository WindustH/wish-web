import tools from './tools.ts';
import type { ExtensionPresentation } from '../types.ts';
export default {
  id: 'openai',
  settings: ['image_generation', 'audio_generation', 'audio_transcription', 'fetch', 'search'],
  tools,
} satisfies ExtensionPresentation;
