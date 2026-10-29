import { mediaFailed, argumentsView, imageResult, mediaResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{
      name: 'runninghub_image',
      title: 'RunningHub Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
    },
    invocation: argumentsView,
    result: imageResult,
  },
  {
    ...{ name: 'runninghub_video', title: 'RunningHub Video', icon: 'video', tags: ['video', 'generation'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
] satisfies ExtensionToolPresentation[];
