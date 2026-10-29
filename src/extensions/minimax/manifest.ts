import { mediaFailed } from '../shared/presentation.ts';
import { record, mediaJob } from '../shared/validation.ts';
import additionalTools from './tools.ts';
import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation } from '../types.ts';
const Invocation = defineAsyncComponent(() => import('./SpeechInvocation.vue'));
const Result = defineAsyncComponent(() => import('./SpeechResult.vue'));
const job = (value: unknown) => mediaJob(value) && value.kind === 'speech';
export default {
  id: 'minimax',
  tools: [
    ...additionalTools,
    {
      name: 'minimax_speech',
      title: 'MiniMax Speech',
      icon: 'audio',
      tags: ['audio', 'speech', 'tts', 'generation', 'subtitles', 'pronunciation', 'voice-effects', 'voice-mixing'],
      invocation(context) {
        const request = record(context.arguments);
        return request && ['run', 'status', 'list_jobs'].includes(String(request.action))
          ? { component: Invocation, props: { request } }
          : undefined;
      },
      failed: mediaFailed,
      result(context) {
        const output = record(context.output);
        if (!context.session || !output) return undefined;
        const jobs = job(output) ? [output] : Array.isArray(output.jobs) ? output.jobs.filter(job) : undefined;
        return jobs
          ? { component: Result, props: { session: context.session, jobs, collection: Array.isArray(output.jobs) } }
          : undefined;
      },
    },
  ],
} satisfies ExtensionPresentation;
