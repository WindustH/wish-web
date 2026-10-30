import { onScopeDispose, shallowRef } from 'vue';
const now = shallowRef(Date.now());
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
export function useQuestionClock() {
  if (users++ === 0) {
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, 15_000);
  }
  onScopeDispose(() => {
    if (--users === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  return now;
}
