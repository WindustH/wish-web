import { shallowRef } from 'vue';

// Inline messages and unsent attachments can be viewed without uploading a file.
// Keep the original independent of the thumbnail and its component lifetime.
export const sidebarImage = shallowRef<{ src: string; name: string; mime?: string } | null>(null);
let ownedUrl: string | undefined;

export function showSidebarImage(src: string, name = '', bytes?: Blob) {
  if (!src && !bytes) return;
  closeSidebarImage();
  if (bytes) ownedUrl = URL.createObjectURL(bytes);
  sidebarImage.value = { src: ownedUrl ?? src, name, mime: bytes?.type };
}

export function closeSidebarImage() {
  sidebarImage.value = null;
  if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  ownedUrl = undefined;
}
