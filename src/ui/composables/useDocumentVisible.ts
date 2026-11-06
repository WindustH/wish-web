import { onScopeDispose, ref } from 'vue';

export function useDocumentVisible() {
  const visible = ref(document.visibilityState !== 'hidden');
  const update = () => (visible.value = document.visibilityState !== 'hidden');
  document.addEventListener('visibilitychange', update);
  onScopeDispose(() => document.removeEventListener('visibilitychange', update));
  return visible;
}
