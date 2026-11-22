// Toast queue as a Vue ref; ToastHost renders it. One owner (this module).
// Core state publishes its notes on the bus as `notice`; they show here too.
import { shallowRef } from 'vue';
import { bus } from '../core/bus.ts';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  text: string;
  sessionId?: string;
  persistent?: boolean;
  action?: { label: string; run: () => void };
  tone?: ToastTone;
  icon?: string;
  detail?: string;
}

const items = shallowRef<ToastItem[]>([]);
let seq = 0;

export function toast(text: string, options: Omit<ToastItem, 'id' | 'text'> = {}) {
  const id = ++seq;
  items.value = [...items.value, { id, text, ...options }];
  return id;
}

export function dismissAllToasts() {
  items.value = [];
}

export function dismissToast(id: number) {
  items.value = items.value.filter((item) => item.id !== id);
}

bus.on('notice', (notice) => {
  if (typeof notice === 'string') toast(notice);
  else toast(notice.text, { tone: notice.tone });
});

export function useToasts() {
  return items;
}
