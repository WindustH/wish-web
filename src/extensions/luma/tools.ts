import { mediaFailed, argumentsView, mediaResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'luma_video', title: 'Luma Video', icon: 'video', tags: ['video', 'generation'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
] satisfies ExtensionToolPresentation[];
