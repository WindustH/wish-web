// Only the public key and SSH signatures leave the browser. IndexedDB can structured-clone
// non-extractable CryptoKeys without serializing the private bytes into application storage.
import { savedAccounts } from '../../core/connectionAccounts.ts';
import { platform } from '../../platform/index.ts';
import { tr } from '../../core/i18n/tr.ts';

export interface BrowserKey {
  id: string;
  name: string;
  publicKey: string;
  privateKey: CryptoKey;
}
async function operation<T>(mode: IDBTransactionMode, run: (keys: IDBObjectStore) => IDBRequest<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('wish-ssh-keys', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('keys', mode);
      const result = run(tx.objectStore('keys'));
      tx.oncomplete = () => resolve(result.result);
      tx.onabort = () => reject(tx.error || new Error('Key storage failed'));
    });
  } finally {
    db.close();
  }
}

export { hostPinKey } from '../../core/connectionAccounts.ts';
export const getKey = (id: string) => operation<BrowserKey | undefined>('readonly', (store) => store.get(id));
export const listKeys = () => operation<BrowserKey[]>('readonly', (store) => store.getAll());
export function keyUsers(id: string) {
  const store = platform('storage');
  const profiles = savedAccounts().filter((a) => a.method === 'ssh' && a.identity === id);
  const names = profiles.map((a) => a.name || a.address);
  if (
    store.get('ssh.connected') === '1' &&
    store.get('ssh.identity') === id &&
    !profiles.some((a) => a.address === store.get('ssh.address'))
  )
    names.push(store.get('ssh.address') || tr('当前连接', 'Current connection'));
  return names;
}
export async function deleteKey(id: string, selectedId = '') {
  let inUse = false;
  await operation('readwrite', (keys) => {
    const check = keys.getKey(id);
    check.onsuccess = () => {
      inUse = id === selectedId || keyUsers(id).length > 0;
      if (!inUse) keys.delete(id);
    };
    return check;
  });
  if (inUse)
    throw new Error(
      tr('密钥正在使用中。请先更换账户的登录密钥。', 'This key is in use. Change the account’s login key first.'),
    );
}
// Save the reference synchronously while this read transaction excludes concurrent deletions.
export async function withStoredKey(id: string, commit: () => void | Promise<void>) {
  if (!id) return commit();
  let saved: Promise<void> | undefined;
  await operation('readonly', (keys) => {
    const get = keys.getKey(id);
    get.onsuccess = () => {
      if (get.result === undefined) return;
      try {
        saved = Promise.resolve(commit());
      } catch (error) {
        saved = Promise.reject(error);
      }
      void saved.catch(() => {});
    };
    return get;
  });
  if (!saved) throw new Error(tr('密钥已删除，请选择其他密钥。', 'The key was removed. Select another key.'));
  await saved;
}

export async function generateKey(name: string, native = false) {
  // P-256 is available in Android System WebView releases that predate Ed25519.
  const algorithm = native ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'Ed25519' };
  const pair = (await crypto.subtle.generateKey(algorithm, false, ['sign', 'verify'])) as CryptoKeyPair;
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const encoder = new TextEncoder();
  const keyType = native ? 'ecdsa-sha2-nistp256' : 'ssh-ed25519';
  const fields = native
    ? [encoder.encode(keyType), encoder.encode('nistp256'), point]
    : [encoder.encode(keyType), point];
  const blob = new Uint8Array(fields.reduce((size, field) => size + 4 + field.length, 0));
  const view = new DataView(blob.buffer);
  let offset = 0;
  for (const field of fields) {
    view.setUint32(offset, field.length);
    blob.set(field, offset + 4);
    offset += 4 + field.length;
  }
  const key: BrowserKey = {
    id: crypto.randomUUID(),
    name,
    publicKey: keyType + ' ' + btoa(String.fromCharCode(...blob)),
    privateKey: pair.privateKey,
  };
  await operation('readwrite', (store) => store.add(key));
  return key;
}
