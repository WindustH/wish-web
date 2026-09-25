// Last good responses, kept in memory and in IndexedDB, so pages open with the
// previous data at once and swap in fresh responses when they arrive. Only
// plain API results belong here (never Vue proxies: IndexedDB clones values).
import { getBaseUrl } from '../api/client.ts';

const DATABASE = 'wish-response-cache';
const STORE = 'responses';
// Timers refresh charts every few seconds; the durable copy only needs to be recent.
const PERSIST_INTERVAL_MS = 30_000;
const MEMORY_ENTRIES = 32;

const memory = new Map<string, unknown>();
const persistedAt = new Map<string, number>();
let database: Promise<IDBDatabase | null> | undefined;

function open() {
  database ??= new Promise(resolve => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}

// Responses belong to the server they came from.
const scoped = (key: string) => `${getBaseUrl()}\n${key}`;

function remember(id: string, value: unknown) {
  memory.delete(id);
  memory.set(id, value);
  while (memory.size > MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
}

/** The cached value if it is already in memory. */
export function peekCached<T>(key: string): T | undefined {
  return memory.get(scoped(key)) as T | undefined;
}

/** The cached value from memory or, after a reload, from IndexedDB. */
export async function readCached<T>(key: string): Promise<T | undefined> {
  const id = scoped(key);
  if (memory.has(id)) return memory.get(id) as T;
  const db = await open();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => {
        if (request.result !== undefined && !memory.has(id)) remember(id, request.result);
        resolve(memory.get(id) as T | undefined);
      };
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Remember a fresh response; `persist: false` keeps it for this page load only. */
export function writeCached(key: string, value: unknown, { persist = true } = {}) {
  const id = scoped(key);
  remember(id, value);
  if (!persist || Date.now() - (persistedAt.get(id) ?? 0) < PERSIST_INTERVAL_MS) return;
  persistedAt.set(id, Date.now());
  void open().then(db => {
    try { db?.transaction(STORE, 'readwrite').objectStore(STORE).put(value, id); } catch { /* quota or private mode */ }
  });
}

export async function clearCached() {
  memory.clear();
  persistedAt.clear();
  const db = await open();
  try { db?.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch { /* unavailable */ }
}
