import { argumentsView, webResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'deepseek_search', title: 'DeepSeek Search', icon: 'web-search', tags: ['web', 'search'] },
    invocation: argumentsView,
    result: webResult,
  },
  {
    ...{ name: 'deepseek_fetch', title: 'DeepSeek Fetch', icon: 'web-reader', tags: ['web', 'fetch', 'reader'] },
    invocation: argumentsView,
    result: webResult,
  },
] satisfies ExtensionToolPresentation[];
