import { imageArtifact, record, mediaJob } from './validation.ts';
// Presentation primitives; each extension chooses which to use in its own manifest.
import { defineAsyncComponent } from 'vue';
import type { ToolRenderContext } from './types.ts';
const Arguments = defineAsyncComponent(() => import('./components/Arguments.vue'));
const Images = defineAsyncComponent(() => import('./components/GeneratedImages.vue'));
const Jobs = defineAsyncComponent(() => import('./components/MediaJobs.vue'));
const Transcript = defineAsyncComponent(() => import('./components/Transcript.vue'));
const Web = defineAsyncComponent(() => import('./components/WebResult.vue'));
export function argumentsView(context: ToolRenderContext) {
  const request = record(context.arguments);
  return request ? { component: Arguments, props: { request } } : undefined;
}
export function imageResult(context: ToolRenderContext) {
  const output = record(context.output);
  if (!context.session || !Array.isArray(output?.images)) return undefined;
  const images = output.images.filter(imageArtifact);
  return images.length ? { component: Images, props: { session: context.session, images } } : undefined;
}
export function mediaResult(context: ToolRenderContext) {
  const output = record(context.output);
  if (!context.session || !output) return undefined;
  const isJob = (value: unknown) => mediaJob(value);
  const jobs = isJob(output) ? [output] : Array.isArray(output.jobs) ? output.jobs.filter(isJob) : undefined;
  return jobs
    ? { component: Jobs, props: { session: context.session, jobs, collection: Array.isArray(output.jobs) } }
    : undefined;
}
export function transcriptResult(context: ToolRenderContext) {
  const output = record(context.output);
  return context.session && typeof output?.text === 'string'
    ? { component: Transcript, props: { session: context.session, output } }
    : undefined;
}
export function webResult(context: ToolRenderContext) {
  const output = record(context.output) ?? record(context.metadata);
  return output ? { component: Web, props: { output } } : undefined;
}

export { record } from './validation.ts';

export function mediaFailed(output: unknown): boolean {
  return mediaJob(output) && ['failed', 'outcome_unknown'].includes(output.status);
}
