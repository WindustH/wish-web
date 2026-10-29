import tools from './tools.ts';
import type { ExtensionPresentation } from '../types.ts';
export default {
  id: 'siliconflow',
  settings: ['image_generation', 'audio_transcription'],
  tools,
} satisfies ExtensionPresentation;
