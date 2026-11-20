import { inject, type InjectionKey } from 'vue';
import { closeForNavigationKey } from '../../ui/composables/useDialogNesting.ts';
import { blobImageReference } from '../../core/api/endpoints.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { useFileMention } from '../references/useFileMention.ts';
import { showSidebarImage } from '../../ui/imageSidebar.ts';
import { toast } from '../../ui/toast.ts';

export type InlineImage = { src: string; name: string; bytes?: Blob; mime?: string };
export const inlineImageKey: InjectionKey<(image: InlineImage) => void> = Symbol('open inline image');

export function useOpenImage() {
  const openFile = useFileMention();
  const openInline = inject(inlineImageKey, undefined);
  const closeSource = inject(closeForNavigationKey, undefined);
  return async (src: string, name = '', bytes?: Blob) => {
    try {
      const reference = blobImageReference(src);
      if (openFile && reference) await openFile({ kind: 'blob', ...reference, name }, 'image');
      else if (openInline) openInline({ src, name, bytes, mime: bytes?.type });
      else {
        showSidebarImage(src, name, bytes);
        return;
      }
      closeSource?.();
    } catch (cause) {
      toast(describeError(cause).message, { tone: 'error' });
    }
  };
}
