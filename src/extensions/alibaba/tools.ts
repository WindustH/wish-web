import { argumentsView, imageResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'wan_image', title: 'Wan Image', icon: 'image', tags: ['image', 'generation', 'editing', 'reference'] },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
