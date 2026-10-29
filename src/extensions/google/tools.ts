import { argumentsView, imageResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{
      name: 'google_interactions_image',
      title: 'Google Interactions Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
    },
    invocation: argumentsView,
    result: imageResult,
  },
  {
    ...{
      name: 'google_image',
      title: 'Google Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
    },
    invocation: argumentsView,
    result: imageResult,
  },
] satisfies ExtensionToolPresentation[];
