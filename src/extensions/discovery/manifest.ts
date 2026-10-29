import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation } from '../types.ts';
import { record } from '../shared/validation.ts';
import { argumentsView } from '../shared/presentation.ts';
const Discovery = defineAsyncComponent(() => import('./DiscoveryResult.vue'));
export default {
  id: 'extension-discovery',
  tools: [
    {
      name: 'extension_tools',
      title: 'Extension Tools',
      icon: 'extensions',
      tags: ['discovery'],
      invocation: argumentsView,
      result(context) {
        const output = record(context.output);
        return output && (Array.isArray(output.tools) || record(output.tool))
          ? { component: Discovery, props: { output } }
          : undefined;
      },
    },
  ],
} satisfies ExtensionPresentation;
