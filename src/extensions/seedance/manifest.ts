import tools from './tools.ts';
import type { ExtensionPresentation } from '../types.ts';
export default {
  id: 'seedance',
  settings: ['image_generation', 'video_generation'],
  tools,
} satisfies ExtensionPresentation;
