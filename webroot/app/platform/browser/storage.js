// Browser storage adapter: localStorage with namespacing + a schema
// version key. Falls back to an in-memory Map (private mode / SSR shells).
import { cfg } from '../../core/config.js';

const mem = new Map();
let backend = null;
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('__wish_probe', '1');
    localStorage.removeItem('__wish_probe');
    backend = localStorage;
  }
} catch { backend = null; }

const ns = `${cfg.meta.storageNamespace}.v${cfg.meta.storageVersion}`;
const key = (k) => `${ns}.${k}`;

export const browserStorage = {
  get(k) {
    try { return backend ? backend.getItem(key(k)) : (mem.get(key(k)) ?? null); }
    catch { return null; }
  },
  set(k, v) {
    try { backend ? backend.setItem(key(k), String(v)) : mem.set(key(k), String(v)); } catch {}
  },
  remove(k) {
    try { backend ? backend.removeItem(key(k)) : mem.delete(key(k)); } catch {}
  },
  keys() {
    const out = [];
    try {
      if (backend) {
        for (let i = 0; i < backend.length; i++) {
          const k = backend.key(i);
          if (k?.startsWith(ns + '.')) out.push(k.slice(ns.length + 1));
        }
      } else {
        for (const k of mem.keys()) if (k.startsWith(ns + '.')) out.push(k.slice(ns.length + 1));
      }
    } catch {}
    return out;
  },
  clear() {
    for (const k of this.keys()) this.remove(k);
  },
  get backend() { return backend ? 'localStorage' : 'memory'; },
};
