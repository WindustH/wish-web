import { mediaFailed } from '../shared/presentation.ts';
import { record, mediaJob } from '../shared/validation.ts';
import additionalTools from './tools.ts';
import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation } from '../types.ts';
const VideoInvocation = defineAsyncComponent(() => import('./VideoInvocation.vue'));
const VideoResult = defineAsyncComponent(() => import('./VideoResult.vue'));
const Invocation = defineAsyncComponent(() => import('./TranscriptionInvocation.vue'));
const SpeechInvocation = defineAsyncComponent(() => import('./SpeechInvocation.vue'));
const SpeechResult = defineAsyncComponent(() => import('./SpeechResult.vue'));
const Result = defineAsyncComponent(() => import('./TranscriptionResult.vue'));
export default {
  id: 'xai',
  tools: [
    ...additionalTools,
    {
      name: 'xai_video',
      title: 'xAI Video',
      icon: 'video',
      tags: ['video', 'generation', 'image-to-video', 'references', 'editing', 'extension'],
      invocation(context) {
        const request = record(context.arguments);
        return request && ['generate', 'edit', 'extend', 'status', 'list_jobs'].includes(String(request.action))
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
    {
      name: 'xai_speech',
      title: 'xAI Speech',
      icon: 'audio',
      tags: ['audio', 'speech', 'tts', 'generation', 'timestamps'],
      invocation(context) {
        const request = record(context.arguments);
        return request && ['run', 'status', 'list_jobs'].includes(String(request.action))
          ? { component: SpeechInvocation, props: { request } }
          : undefined;
      },
      failed: mediaFailed,
      result(context) {
        const output = record(context.output);
        if (!context.session || !output) return undefined;
        const isJob = (value: unknown) => mediaJob(value) && value.kind === 'speech';
        const jobs = isJob(output) ? [output] : Array.isArray(output.jobs) ? output.jobs.filter(isJob) : undefined;
        return jobs
          ? {
              component: SpeechResult,
              props: { session: context.session, jobs, collection: Array.isArray(output.jobs) },
            }
          : undefined;
      },
    },
    {
      name: 'xai_transcribe',
      title: 'xAI Transcribe',
      icon: 'mic',
      tags: ['audio', 'asr', 'transcription', 'speech-to-text'],
      invocation(context) {
        const request = record(context.arguments);
        return request && typeof request.audio === 'string' ? { component: Invocation, props: { request } } : undefined;
      },
      failed: mediaFailed,
      result(context) {
        const output = record(context.output);
        return context.session && typeof output?.text === 'string'
          ? { component: Result, props: { session: context.session, output } }
          : undefined;
      },
    },
  ],
} satisfies ExtensionPresentation;
