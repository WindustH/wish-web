// Toast queue as a Vue ref; ToastHost renders it. One owner (this module).
import { shallowRef } from 'vue';

export interface ToastItem { id: number; text: string }

const items = shallowRef<ToastItem[]>([]);
let seq = 0;

export function toast(text: string) {
  const id = ++seq;
  items.value = [...items.value, { id, text }];
  setTimeout(() => { items.value = items.value.filter((t) => t.id !== id); }, 3600);
}

export function useToasts() { return items; }
