// Bounded, platform-backed persistence for UI workspace state; no Vue dependency.
import { tryPlatform } from '../../platform/index.ts';

type Fields = Record<string, string | number | boolean>;
const KEY = 'workspace.views.v1';
function entries(): [string, Fields][] {
  try {
    const parsed: unknown = JSON.parse(tryPlatform('storage')?.get(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (entry) => Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] && typeof entry[1] === 'object',
          )
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}
export function readWorkspaceState<T extends Fields>(key: string, defaults: T): T {
  const result = { ...defaults };
  const saved = entries().find(([id]) => id === key)?.[1];
  for (const field of Object.keys(defaults) as (keyof T)[]) {
    const value = saved?.[field as string];
    if (typeof value === typeof defaults[field] && (typeof value !== 'number' || Number.isFinite(value)))
      result[field] = value as T[keyof T];
  }
  return result;
}
export function writeWorkspaceState(key: string, state: Fields) {
  try {
    const records = entries().filter(([id]) => id !== key);
    records.push([key, state]);
    tryPlatform('storage')?.set(KEY, JSON.stringify(records.slice(-100)));
  } catch {
    /* Unavailable storage must not interrupt reading. */
  }
}
