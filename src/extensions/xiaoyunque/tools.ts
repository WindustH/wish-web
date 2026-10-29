import { mediaFailed, argumentsView, mediaResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'xiaoyunque_video', title: 'Xiaoyunque Video', icon: 'video', tags: ['video', 'generation'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
] satisfies ExtensionToolPresentation[];
