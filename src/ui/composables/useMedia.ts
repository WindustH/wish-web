import { ref, onScopeDispose } from 'vue';
import { cfg } from '../../core/config.ts';

/** Reactive matchMedia — disposes the listener with its owner scope. */
export function useMedia(query: string) {
  const mq = matchMedia(query);
  const matches = ref(mq.matches);
  const fn = () => { matches.value = mq.matches; };
  mq.addEventListener('change', fn);
  onScopeDispose(() => mq.removeEventListener('change', fn));
  return matches;
}

/** The phone layout: narrower than the two-pane desktop shell. */
export const MOBILE_QUERY = `(max-width: ${cfg.breakpoints.desktop - 1}px)`;

/** Whether the phone layout is showing, as it changes. */
export const useIsMobile = () => useMedia(MOBILE_QUERY);
