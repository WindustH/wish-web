// Toast queue as a Vue ref; ToastHost renders it. One owner (this module).
// Core state publishes its notes on the bus as `notice`; they show here too.
import { shallowRef } from 'vue';
import { bus } from '../core/bus.ts';

export interface ToastItem { id: number; text: string }

const items = shallowRef<ToastItem[]>([]);
let seq = 0;

export function toast(text: string) {
  const id = ++seq;
  items.value = [...items.value, { id, text }];
  setTimeout(() => { items.value = items.value.filter((t) => t.id !== id); }, 3600);
}

bus.on('notice', (message: string) => toast(message));

export function useToasts() { return items; }
