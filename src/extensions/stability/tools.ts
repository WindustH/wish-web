import { argumentsView, imageResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'stability_image', title: 'Stability Image', icon: 'image', tags: ['image', 'generation'] },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
