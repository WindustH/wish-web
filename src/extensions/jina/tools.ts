import { argumentsView, webResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'jina_search', title: 'Jina Search', icon: 'web-search', tags: ['web', 'search'] },
    invocation: argumentsView,
    result: webResult,
  },
  {
    ...{ name: 'jina_fetch', title: 'Jina Fetch', icon: 'web-reader', tags: ['web', 'fetch', 'reader'] },
    invocation: argumentsView,
    result: webResult,
  },
] satisfies ExtensionToolPresentation[];
