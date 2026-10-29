import { imageArtifact, record } from '../shared/validation.ts';
import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation, ToolRenderContext, ToolRenderBinding } from '../types.ts';
const Invocation = defineAsyncComponent(() => import('./ImageInvocation.vue'));
const Result = defineAsyncComponent(() => import('./ImageResult.vue'));
function invocation(context: ToolRenderContext): ToolRenderBinding | undefined {
  const request = record(context.arguments);
  if (
    !request ||
    typeof request.prompt !== 'string' ||
    (request.service !== undefined && typeof request.service !== 'string')
  )
    return undefined;
  return { component: Invocation, props: { session: context.session, request, fill: context.tool === 'bfl_fill' } };
}
function result(context: ToolRenderContext): ToolRenderBinding | undefined {
  const output = record(context.output);
  if (!context.session || !Array.isArray(output?.images)) return undefined;
  const images = output.images.filter(imageArtifact);
  return images.length
    ? {
        component: Result,
        props: { session: context.session, images, model: typeof output.model === 'string' ? output.model : undefined },
      }
    : undefined;
}
export default {
  id: 'bfl',
  settings: ['image_generation'],
  tools: [
    {
      name: 'bfl_generate',
      title: 'FLUX Image',
      icon: 'image',
      tags: ['image', 'generation', 'editing', 'reference'],
      invocation,
      result,
    },
    {
      name: 'bfl_fill',
      title: 'FLUX Fill',
      icon: 'image',
      tags: ['image', 'editing', 'inpainting', 'outpainting', 'mask'],
      invocation,
      result,
    },
  ],
} satisfies ExtensionPresentation;
