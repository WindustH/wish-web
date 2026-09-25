// Browser storage adapter: localStorage with namespacing + a schema
// version key. Falls back to an in-memory Map (private mode / SSR shells).
import { cfg } from '../../core/config.ts';

const mem = new Map<string, string>();
let backend: Storage | null = null;
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('__wish_probe', '1');
    localStorage.removeItem('__wish_probe');
    backend = localStorage;
  }
} catch { backend = null; }

const ns = `${cfg.meta.storageNamespace}.v${cfg.meta.storageVersion}`;
const key = (k: string) => `${ns}.${k}`;

export const browserStorage = {
  get(k: string): string | null {
    try { return backend ? backend.getItem(key(k)) : (mem.get(key(k)) ?? null); }
    catch { return null; }
  },
  set(k: string, v: string): void {
    try { backend ? backend.setItem(key(k), String(v)) : mem.set(key(k), String(v)); } catch (err) { console.warn('[storage] persist failed:', err); }
  },
  remove(k: string): void {
    try { backend ? backend.removeItem(key(k)) : mem.delete(key(k)); } catch {}
  },
  keys(): string[] {
    const out: string[] = [];
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
  clear(): void {
    for (const k of this.keys()) this.remove(k);
  },
  get backend(): 'localStorage' | 'memory' { return backend ? 'localStorage' : 'memory'; },
};
