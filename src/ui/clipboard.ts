import { platform } from '../platform/index.ts';
import { toast } from './toast.ts';
import { tr } from '../core/i18n/tr.ts';

/** Copies text to the clipboard; says so in a toast when it could not. Whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await platform('clipboard').writeText(text);
    return true;
  } catch (error) {
    toast(tr('复制失败：', 'Copy failed: ') + String(error));
    return false;
  }
}
