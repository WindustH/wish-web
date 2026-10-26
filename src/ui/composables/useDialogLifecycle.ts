import { computed, onScopeDispose, ref, watch } from 'vue';

export interface DialogLifecycleOptions {
  open: () => boolean;
  active: () => boolean;
  dismissable: () => boolean;
  beforeClose: () => boolean | Promise<boolean> | undefined;
  reducedMotion: () => boolean;
  closed: () => void;
}

/** Owns modal presence and closing. Animation completion is optional, never the cleanup authority. */
export function useDialogLifecycle(options: DialogLifecycleOptions) {
  const phase = ref<'closed' | 'open' | 'closing'>('closed');
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;
  let checkingClose = false;

  function cancelPendingClose() {
    revision++;
    checkingClose = false;
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  function finishClose() {
    if (phase.value !== 'closing') return;
    cancelPendingClose();
    phase.value = 'closed';
    if (options.open()) options.closed();
  }
  function beginClose() {
    phase.value = 'closing';
    if (!options.active() || options.reducedMotion()) finishClose();
    else closeTimer = setTimeout(finishClose, 300);
  }
  watch(options.open, open => {
    cancelPendingClose();
    if (open) phase.value = 'open';
    else if (phase.value !== 'closed') beginClose();
  }, { immediate: true, flush: 'sync' });
  watch(options.active, active => {
    if (active) return;
    cancelPendingClose();
    if (phase.value === 'closing') finishClose();
  }, { flush: 'sync' });

  async function requestClose() {
    if (!options.active() || !options.dismissable() || phase.value !== 'open' || checkingClose) return;
    checkingClose = true;
    const requestedRevision = revision;
    try {
      const approval = options.beforeClose();
      const allowed = approval instanceof Promise ? await approval : approval;
      if (requestedRevision !== revision || allowed === false || !options.dismissable()) return;
      beginClose();
    } finally {
      if (requestedRevision === revision) checkingClose = false;
    }
  }
  onScopeDispose(cancelPendingClose);
  return {
    mounted: computed(() => options.active() && phase.value !== 'closed'),
    contentOpen: computed(() => options.active() && phase.value === 'open'),
    requestClose,
    finishClose,
  };
}
