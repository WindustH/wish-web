import { mediaFailed } from '../shared/presentation.ts';
import { record, mediaJob } from '../shared/validation.ts';
import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation } from '../types.ts';
const VideoInvocation = defineAsyncComponent(() => import('./VideoInvocation.vue'));
const VideoResult = defineAsyncComponent(() => import('./VideoResult.vue'));
export default {
  id: 'runway',
  settings: ['video_generation'],
  tools: [
    {
      name: 'runway_video',
      title: 'Runway Video',
      icon: 'video',
      tags: ['video', 'generation', 'image-to-video', 'editing', 'keyframes', 'outpainting'],
      invocation(context) {
        const request = record(context.arguments);
        return request && ['generate', 'edit', 'status', 'list_jobs'].includes(String(request.action))
          ? { component: VideoInvocation, props: { request, session: context.session } }
          : undefined;
      },
      failed: mediaFailed,
      result(context) {
        const output = record(context.output);
        if (!context.session || !output) return undefined;
        const isJob = (value: unknown) => mediaJob(value) && value.kind === 'video';
        const jobs = isJob(output) ? [output] : Array.isArray(output.jobs) ? output.jobs.filter(isJob) : undefined;
        return jobs
          ? {
              component: VideoResult,
              props: { session: context.session, jobs, collection: Array.isArray(output.jobs) },
            }
          : undefined;
      },
    },
  ],
} satisfies ExtensionPresentation;
