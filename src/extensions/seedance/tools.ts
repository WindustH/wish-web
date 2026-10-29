import { mediaFailed, argumentsView, imageResult, mediaResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{
      name: 'seedream_image',
      title: 'Seedream Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
    },
    invocation: argumentsView,
    result: imageResult,
  },
  {
    ...{ name: 'seedance_video', title: 'Seedance Video', icon: 'video', tags: ['video', 'generation'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
] satisfies ExtensionToolPresentation[];
