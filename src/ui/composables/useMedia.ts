import { ref, onScopeDispose } from 'vue';

/** Reactive matchMedia — disposes the listener with its owner scope. */
export function useMedia(query: string) {
  const mq = matchMedia(query);
  const matches = ref(mq.matches);
  const fn = () => { matches.value = mq.matches; };
  mq.addEventListener('change', fn);
  onScopeDispose(() => mq.removeEventListener('change', fn));
  return matches;
}
