import { mediaFailed, argumentsView, mediaResult, webResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'minimax_search', title: 'MiniMax Search', icon: 'web-search', tags: ['web', 'search'] },
    invocation: argumentsView,
    result: webResult,
  },
  {
    ...{ name: 'minimax_video', title: 'MiniMax Video', icon: 'video', tags: ['video', 'generation'] },
    invocation: argumentsView,
    result: mediaResult,
    failed: mediaFailed,
  },
] satisfies ExtensionToolPresentation[];
