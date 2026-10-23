// A picture looked at closely: the log's own images open into this, one at a time, over whatever
// is on screen. Nothing of the conversation changes - the overlay opens and closes, and the page
// behind it stays where it was.
import { shallowRef } from 'vue';

export type LightboxImage = { src: string; alt?: string };

export const imageLightbox = shallowRef<LightboxImage | null>(null);
let ownedUrl: string | undefined;
function releaseImage() { if (ownedUrl) URL.revokeObjectURL(ownedUrl); ownedUrl = undefined; }

export function openImageLightbox(src: string, alt?: string, blob?: Blob) {
  if (!src) return;
  releaseImage();
  // A thumbnail in a virtual grid can unmount while its original is still open. The viewer
  // owns its own URL, independently of the thumbnail's authenticated fetch and cleanup.
  if (blob) ownedUrl = URL.createObjectURL(blob);
  imageLightbox.value = { src: ownedUrl ?? src, alt };
}

export function closeImageLightbox() {
  imageLightbox.value = null;
  releaseImage();
}
