import { ref, onScopeDispose } from 'vue';

/** Reactive matchMedia — disposes the listener with its owner scope. */
export function useMedia(query: string) {
  const matches = ref(matchMedia(query).matches);
  const mq = matchMedia(query);
  const fn = () => { matches.value = mq.matches; };
  mq.addEventListener('change', fn);
  onScopeDispose(() => mq.removeEventListener('change', fn));
  return matches;
}
