import { imageArtifact, record } from '../shared/validation.ts';
import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation } from '../types.ts';
const Invocation = defineAsyncComponent(() => import('./ImageInvocation.vue'));
const Result = defineAsyncComponent(() => import('./ImageResult.vue'));

export default {
  id: 'novelai',
  settings: ['image_generation'],
  tools: [
    {
      name: 'novelai_generate',
      title: 'NovelAI Image',
      icon: 'image',
      tags: ['image', 'generation', 'anime', 'editing', 'reference', 'character'],
      invocation(context) {
        const args = record(context.arguments);
        if (
          !args ||
          typeof args.prompt !== 'string' ||
          (args.service !== undefined && typeof args.service !== 'string')
        )
          return undefined;
        return { component: Invocation, props: { session: context.session, request: args } };
      },
      result(context) {
        const output = record(context.output);
        if (!context.session || !Array.isArray(output?.images)) return undefined;
        const images = output.images.filter(imageArtifact);
        return images.length
          ? {
              component: Result,
              props: {
                session: context.session,
                images,
                model: typeof output.model === 'string' ? output.model : undefined,
              },
            }
          : undefined;
      },
    },
  ],
} satisfies ExtensionPresentation;
