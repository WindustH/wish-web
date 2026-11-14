import type { ResponseCacheAdapter } from '../index.ts';

// Keep the existing database name so upgrades also clear the previous account's cache.
export function createBrowserResponseCache(databaseName = 'wish-response-cache'): ResponseCacheAdapter {
  const store = 'responses';
  let database: Promise<IDBDatabase | null> | undefined;
  function open(): Promise<IDBDatabase | null> {
    if (database) return database;
    const attempt = new Promise<IDBDatabase | null>((resolve) => {
      let settled = false;
      const fail = () => {
        settled = true;
        resolve(null);
      };
      try {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onerror = request.onblocked = fail;
        request.onsuccess = () => {
          const db = request.result;
          if (settled) {
            db.close();
            return;
          }
          settled = true;
          db.onversionchange = () => {
            db.close();
            if (database === attempt) database = undefined;
          };
          resolve(db);
        };
      } catch {
        fail();
      }
    });
    database = attempt;
    void attempt.then((db) => {
      if (!db && database === attempt) database = undefined;
    });
    return attempt;
  }
  async function transaction(
    mode: IDBTransactionMode,
    request: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    const db = await open();
    if (!db) return undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const result = request(tx.objectStore(store));
      tx.oncomplete = () => resolve(result.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Response cache transaction failed'));
    });
  }
  return {
    read: (key) => transaction('readonly', (store) => store.get(key)),
    async write(key, value) {
      await transaction('readwrite', (store) => store.put(value, key));
    },
    async clear() {
      await transaction('readwrite', (store) => store.clear());
    },
  };
}
