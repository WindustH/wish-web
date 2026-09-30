/** `base`, or the first of `base-2`, `base-3`, … that is not taken yet. */
export function uniqueId(base: string, taken: (id: string) => boolean): string {
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}
