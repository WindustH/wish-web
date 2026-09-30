import { nextTick, watch, type WatchSource } from 'vue';
import { cfg } from '../../core/config.ts';

/**
 * In a conversation the message field starts one line tall and grows with its text, up to a
 * number of lines and a share of the window; then it scrolls. With `fixed` true (the start page's
 * larger field on a desktop) it keeps its own height.
 */
export function useAutoGrow(element: () => HTMLElement | null | undefined, sources: WatchSource[], options: { mobile: () => boolean; fixed: () => boolean }) {
  watch(sources, async () => {
    await nextTick();
    const el = element();
    if (!el) return;
    if (options.fixed()) {
      el.style.height = '';
      el.style.overflowY = 'auto';
      return;
    }
    el.style.height = 'auto';
    const style = getComputedStyle(el);
    const lineH = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const maxPx = Math.min(
      lineH * (options.mobile() ? cfg.composer.mobileMaxRows : cfg.composer.desktopMaxRows) + padding,
      window.innerHeight * cfg.composer.maxHeightVh,
    );
    el.style.height = Math.min(el.scrollHeight, maxPx) + 'px';
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  });
}
