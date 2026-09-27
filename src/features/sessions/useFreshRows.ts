import { onScopeDispose, shallowRef, watch, type Ref } from 'vue';

// Rows that just arrived at the end of the conversation, for a brief entrance.
// Nothing moves on the first load, when older history is added above, or when
// a row scrolls back into view (the list recycles rows, so this goes by keys
// rather than by mounting). `enters` decides which kinds of rows take part.
export function useFreshRows<T extends { key: string }>(
  rows: Ref<readonly T[]>,
  sessionId: Ref<string>,
  loaded: () => boolean,
  enters: (row: T) => boolean,
) {
  const fresh = shallowRef<ReadonlySet<string>>(new Set());
  let seen = new Set<string>();
  let owner: string | null = null;
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(rows, items => {
    if (sessionId.value !== owner) {
      owner = sessionId.value;
      seen = new Set();
      armed = false;
      fresh.value = new Set();
    }
    // Only what follows the last row already shown is new at the end.
    let last = -1;
    items.forEach((row, index) => { if (seen.has(row.key)) last = index; });
    const added = armed ? items.slice(last + 1).filter(row => !seen.has(row.key) && enters(row)).map(row => row.key) : [];
    for (const row of items) seen.add(row.key);
    if (!armed) armed = items.length > 0 && loaded();
    if (!added.length) return;
    fresh.value = new Set([...fresh.value, ...added]);
    clearTimeout(timer);
    timer = setTimeout(() => { fresh.value = new Set(); }, 800);
  }, { immediate: true });
  onScopeDispose(() => clearTimeout(timer));

  return fresh;
}
