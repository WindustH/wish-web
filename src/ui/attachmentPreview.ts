import { shallowRef } from 'vue';
export type PreviewAttachment = { kind: string; name?: string; mime?: string; bytes?: ArrayBuffer; localUrl?: string; url?: string; pastedText?: boolean; anchor?: HTMLElement; editText?: (text: string) => void };
export const attachmentPreview = shallowRef<PreviewAttachment | null>(null);
export function previewAttachment(item: PreviewAttachment, event: Event) {
  const anchor = event.currentTarget;
  if (!(anchor instanceof HTMLElement)) return;
  if (attachmentPreview.value?.anchor === anchor) attachmentPreview.value = null;
  else attachmentPreview.value = { ...item, anchor };
}
