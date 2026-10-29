// Each model keeps the slot it first received, so filtering a time range or
// hiding models never recolors the rest. Remembered across launches.
import { tryPlatform } from '../../platform/index.ts';
const STORAGE = 'modelColors';
const PALETTE = 6;
let slots: Record<string, number> | undefined;

function load() {
  if (slots) return slots;
  try {
    const value: unknown = JSON.parse(tryPlatform('storage')?.get(STORAGE) || '{}');
    slots = Object.fromEntries(
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).filter(
            ([, index]) => typeof index === 'number' && Number.isSafeInteger(index) && index >= 0,
          )
        : [],
    );
  } catch {
    slots = {};
  }
  return slots!;
}

/** The key a model's color is remembered by. */
export const modelKey = (provider: string | null, model: string | null) => JSON.stringify([provider, model]);
/** The chart color of a slot. */
export const chartColor = (index: number) => `var(--chart-${(index % PALETTE) + 1})`;

export function modelColorIndex(key: string): number {
  const known = load();
  if (known[key] == null) {
    const used = new Set(Object.values(known).map((index) => index % PALETTE));
    let index = 0;
    while (used.has(index % PALETTE) && index < PALETTE) index++;
    known[key] = index < PALETTE ? index : Object.keys(known).length;
    try {
      tryPlatform('storage')?.set(STORAGE, JSON.stringify(known));
    } catch {
      /* storage unavailable */
    }
  }
  return known[key]!;
}
