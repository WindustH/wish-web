import { argumentsView, imageResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{
      name: 'jimeng_image',
      title: 'Jimeng Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
    },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
