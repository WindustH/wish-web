// Desktop composer height: user preference persisted per device, viewport
// clamps never overwrite it. Mobile never uses this.
import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import { cfg } from '../../core/config.js';
import { tryPlatform } from '../../platform/index.js';

const HEIGHT_KEY = 'pref.composerHeight';

export function useComposerHeight(el: Ref<HTMLElement | null>) {
  const preferred = ref<number | null>(null);
  const available = ref(0);
  let observer: ResizeObserver | null = null;

  const saved = Number(tryPlatform('storage')?.get(HEIGHT_KEY));
  preferred.value = Number.isFinite(saved) && saved > 0 ? saved : null;

  onMounted(() => {
    const container = el.value?.parentElement;
    if (!container) return;
    const update = () => { available.value = container.clientHeight; };
    update();
    observer = new ResizeObserver(update);
    observer.observe(container);
  });
  onUnmounted(() => observer?.disconnect());

  const max = () => Math.round(available.value * cfg.composer.desktopMaxHeightRatio);
  const min = () => Math.min(cfg.composer.desktopMinHeight, max());
  const bound = (h: number) => Math.min(max(), Math.max(min(), Math.round(h)));
  const height = () => bound(preferred.value ?? available.value * cfg.composer.desktopHeightRatio);
  const change = (h: number) => { preferred.value = bound(h); };
  const commit = (h: number) => {
    const next = bound(h);
    preferred.value = next;
    tryPlatform('storage')?.set(HEIGHT_KEY, String(next));
  };
  return { height, min: () => min(), max: () => max(), change, commit, preferred, available };
}
