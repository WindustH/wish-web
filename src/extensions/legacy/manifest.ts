import { imageArtifact, record, mediaJob } from '../shared/validation.ts';
// Compatibility presentation for existing unified-tool history. New extensions own their schemas.
import { defineAsyncComponent } from 'vue';
import type { ExtensionPresentation, ToolRenderContext } from '../types.ts';
const Media = defineAsyncComponent(() => import('../shared/components/MediaJob.vue'));
const Transcript = defineAsyncComponent(() => import('../shared/components/Transcript.vue'));
const Images = defineAsyncComponent(() => import('../shared/components/GeneratedImages.vue'));

function media(context: ToolRenderContext) {
  const output = record(context.output);
  return context.session && mediaJob(output)
    ? { component: Media, props: { session: context.session, output } }
    : undefined;
}
export default {
  id: 'legacy-generators',
  tools: [
    { name: 'video_generate', title: 'Video Generate', icon: 'video', tags: ['video', 'generation'], result: media },
    { name: 'audio_generate', title: 'Audio Generate', icon: 'audio', tags: ['audio', 'generation'], result: media },
    {
      name: 'audio_transcribe',
      title: 'Audio Transcribe',
      icon: 'mic',
      tags: ['audio', 'transcription', 'asr'],
      result(context) {
        const output = record(context.output);
        return context.session && typeof output?.text === 'string'
          ? { component: Transcript, props: { session: context.session, output } }
          : undefined;
      },
    },
    {
      name: 'image_generate',
      title: 'Image Generate',
      icon: 'image',
      tags: ['image', 'generation'],
      result(context) {
        const output = record(context.output);
        if (!context.session || !Array.isArray(output?.images)) return undefined;
        const images = output.images.filter(imageArtifact);
        return images.length ? { component: Images, props: { session: context.session, images } } : undefined;
      },
    },
  ],
} satisfies ExtensionPresentation;
