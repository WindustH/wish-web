import { nextTick, ref, watch, type Ref } from 'vue';

export function useBtwPopup(
  mobile: Ref<boolean>, pageActive: Ref<boolean>,
  composerEl: Ref<HTMLElement | null>, ta: Ref<{ blur(): void } | null>,
  btwButton: Ref<HTMLButtonElement | null>, btwBubble: Ref<HTMLElement | null>,
) {
  const btwOpen = ref(false);
  const btwHidden = ref(true);
  const btwPosition = ref<Record<string, string>>({});
  watch(pageActive, active => { if (!active) btwOpen.value = false; });
  let frame = 0;
  function schedulePosition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (btwOpen.value) positionBtw(); });
  }
  function positionBtw() {
    const button = btwButton.value;
    if (!button) return;
    const rect = (mobile.value ? composerEl.value : button)?.getBoundingClientRect() ?? button.getBoundingClientRect();
    const inset = mobile.value ? 20 : 8;
    const gap = mobile.value ? 20 : 16;
    const width = Math.min(460, window.innerWidth - inset * 2);
    const left = Math.max(inset, Math.min(rect.left, window.innerWidth - width - inset));
    const buttonRect = button.getBoundingClientRect();
    const tailX = Math.max(18, Math.min(buttonRect.left + buttonRect.width / 2 - left, width - 18));
    btwPosition.value = {
      left: `${left}px`,
      bottom: `${Math.max(inset, window.innerHeight - rect.top + gap)}px`,
      maxHeight: `${Math.max(80, rect.top - gap - inset)}px`,
      '--bubble-tail-x': `${tailX}px`,
    };
  }
  function onBtwOutside(event: PointerEvent) {
    const target = event.target as Node;
    if (mobile.value && composerEl.value?.contains(target)) return;
    if (!btwBubble.value?.contains(target) && !btwButton.value?.contains(target)) btwOpen.value = false;
  }
  function onBtwEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !btwOpen.value) return;
    event.preventDefault();
    event.stopPropagation();
    btwOpen.value = false;
    if (!mobile.value) btwButton.value?.focus();
  }
  function onBtwScroll(event: Event) {
    if (!btwBubble.value?.contains(event.target as Node)) schedulePosition();
  }
  function toggleBtw() {
    btwOpen.value = !btwOpen.value;
    if (btwOpen.value && mobile.value) ta.value?.blur();
  }
  watch(btwOpen, (open, _, onCleanup) => {
    if (!open) return;
    btwHidden.value = false;
    void nextTick(() => {
      if (!btwOpen.value) return;
      positionBtw();
      if (!mobile.value) btwBubble.value?.querySelector('textarea')?.focus();
    });
    document.addEventListener('pointerdown', onBtwOutside);
    window.addEventListener('keydown', onBtwEscape, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', onBtwScroll, true);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onBtwOutside);
      window.removeEventListener('keydown', onBtwEscape, true);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', onBtwScroll, true);
      window.visualViewport?.removeEventListener('resize', schedulePosition);
    });
  });

  return { btwOpen, btwHidden, btwPosition, toggleBtw };
}
