// Reapply the fields changed in a local draft onto a newer server snapshot.
// An explicit local edit wins if both sides changed that field.
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function replayConfigChanges(base: unknown, edited: unknown, latest: unknown): unknown {
  if (JSON.stringify(base) === JSON.stringify(edited)) return latest;
  if (!isRecord(base) || !isRecord(edited) || !isRecord(latest)) return edited;
  const merged = { ...latest };
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)])) {
    if (!(key in edited)) delete merged[key];
    else if (!(key in base)) merged[key] = edited[key];
    else merged[key] = replayConfigChanges(base[key], edited[key], latest[key]);
  }
  return merged;
}
