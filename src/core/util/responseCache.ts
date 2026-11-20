// Last good plain responses: bounded memory plus an optional platform cache.
import { previewCache } from './previewCache.ts';
import { getConnectionScope } from '../api/client.ts';
import { tryPlatform } from '../../platform/index.ts';

const PERSIST_INTERVAL_MS = 30_000;
const MEMORY_ENTRIES = 32;
const memory = new Map<string, unknown>();
const pendingWrites = new Set<Promise<void>>();
const persistedAt = new Map<string, number>();
let generation = 0;
let suspended = false;
const scoped = (key: string) => `${getConnectionScope()}\n${key}`;
function remember(id: string, value: unknown) {
  memory.delete(id);
  memory.set(id, value);
  while (memory.size > MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
}
export function peekCached<T>(key: string): T | undefined {
  return memory.get(scoped(key)) as T | undefined;
}
export async function readCached<T>(key: string): Promise<T | undefined> {
  if (suspended) return undefined;
  const id = scoped(key),
    current = generation;
  if (memory.has(id)) return memory.get(id) as T;
  try {
    const value = await tryPlatform('responseCache')?.read(id);
    if (current !== generation || suspended) return undefined;
    if (value !== undefined && !memory.has(id)) remember(id, value);
    return memory.get(id) as T | undefined;
  } catch {
    return undefined;
  }
}
export function writeCached(key: string, value: unknown, { persist = true } = {}) {
  if (suspended) return;
  const id = scoped(key),
    current = generation;
  remember(id, value);
  if (!persist || Date.now() - (persistedAt.get(id) ?? 0) < PERSIST_INTERVAL_MS) return;
  persistedAt.set(id, Date.now());
  const write = tryPlatform('responseCache')
    ?.write(id, value)
    .catch(() => {
      if (current === generation) persistedAt.delete(id);
    });
  if (write) {
    pendingWrites.add(write);
    void write.then(() => pendingWrites.delete(write));
  }
}
/** A connection change suspends late network writes until the new page loads. */
function resetMemory(suspend: boolean) {
  generation++;
  suspended ||= suspend;
  previewCache.clear();
  memory.clear();
  persistedAt.clear();
}
export async function suspendCached() {
  resetMemory(true);
  await Promise.all(pendingWrites);
}
export async function clearCached({ suspend = false } = {}) {
  resetMemory(suspend);
  await tryPlatform('responseCache')?.clear();
}
