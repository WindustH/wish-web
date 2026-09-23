import { onScopeDispose, type Ref } from 'vue';
import { cfg } from '../../core/config.js';

export interface ComposerSizing {
  min: () => number;
  max: () => number;
  height: () => number;
  change: (h: number) => void;
  commit: (h: number) => void;
}

export function useComposerDrag(
  sizing: ComposerSizing,
  height: Ref<number>,
) {
  let cancelActiveDrag: (() => void) | undefined;
  onScopeDispose(() => {
    cancelActiveDrag?.();
    document.documentElement.classList.remove('resizing-composer');
  });

  function startComposerDrag(e: PointerEvent) {
    if (e.button !== 0) return;
    cancelActiveDrag?.();
    e.preventDefault();
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const y = e.clientY;
    const h0 = height.value;
    document.documentElement.classList.add('resizing-composer');
    const heightAt = (ev: PointerEvent) => h0 + y - ev.clientY;

    function release(commitHeight: number) {
      if (!cancelActiveDrag) return;
      cancelActiveDrag = undefined;
      document.documentElement.classList.remove('resizing-composer');
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', pointerCancel, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      t.removeEventListener('lostpointercapture', cancel);
      if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
      sizing.commit(commitHeight);
    }

    function up(ev: PointerEvent) {
      if (ev.pointerId === e.pointerId) release(heightAt(ev));
    }
    function cancel() { release(h0); }
    function pointerCancel(ev: PointerEvent) {
      if (ev.pointerId === e.pointerId) cancel();
    }
    function visibility() {
      if (document.hidden) cancel();
    }
    function move(ev: PointerEvent) {
      if (ev.pointerId !== e.pointerId) return;
      if (!(ev.buttons & 1)) {
        up(ev);
        return;
      }
      sizing.change(heightAt(ev));
    }

    cancelActiveDrag = cancel;
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', pointerCancel, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    t.addEventListener('lostpointercapture', cancel);
  }

  function resizeKeys(e: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    sizing.commit(
      e.key === 'Home'
        ? sizing.min()
        : e.key === 'End'
          ? sizing.max()
          : height.value + (e.key === 'ArrowUp' ? 1 : -1) * cfg.composer.resizeStep,
    );
  }

  return {
    startComposerDrag,
    resizeKeys,
  };
}
