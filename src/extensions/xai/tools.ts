import { argumentsView, imageResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'xai_image', title: 'xAI Image', icon: 'image', tags: ['image', 'generation', 'editing', 'reference'] },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
