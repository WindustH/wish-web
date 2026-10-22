// A picture looked at closely: the log's own images open into this, one at a time, over whatever
// is on screen. Nothing of the conversation changes - the overlay opens and closes, and the page
// behind it stays where it was.
import { shallowRef } from 'vue';

export type LightboxImage = { src: string; alt?: string };

export const imageLightbox = shallowRef<LightboxImage | null>(null);

export function openImageLightbox(src: string, alt?: string) {
  if (!src) return;
  imageLightbox.value = { src, alt };
}

export function closeImageLightbox() {
  imageLightbox.value = null;
}
