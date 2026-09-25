import type { InjectionKey } from 'vue';

/** A page's color slot for a model key, so every chart on it colors a model alike. */
export const modelColorKey: InjectionKey<(key: string) => number | undefined> = Symbol('modelColor');

// Each model keeps the slot it first received, so filtering a time range or
// hiding models never recolors the rest. Remembered across launches.
const STORAGE = 'wish.modelColors';
const PALETTE = 6;
let slots: Record<string, number> | undefined;

function load() {
  if (slots) return slots;
  try { slots = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { slots = {}; }
  return slots!;
}

export function modelColorIndex(key: string): number {
  const known = load();
  if (known[key] == null) {
    const used = new Set(Object.values(known).map(index => index % PALETTE));
    let index = 0;
    while (used.has(index % PALETTE) && index < PALETTE) index++;
    known[key] = index < PALETTE ? index : Object.keys(known).length;
    try { localStorage.setItem(STORAGE, JSON.stringify(known)); } catch { /* storage unavailable */ }
  }
  return known[key]!;
}
