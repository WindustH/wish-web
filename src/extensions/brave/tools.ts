import { argumentsView, webResult } from '../shared/presentation.ts';
import type { ExtensionToolPresentation } from '../types.ts';
export default [
  {
    ...{ name: 'brave_search', title: 'Brave Search', icon: 'web-search', tags: ['web', 'search'] },
    invocation: argumentsView,
    result: webResult,
  },
] satisfies ExtensionToolPresentation[];
