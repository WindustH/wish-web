import { argumentsView, imageResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'replicate_image', title: 'Replicate Image', icon: 'image', tags: ['image', 'generation'] },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
