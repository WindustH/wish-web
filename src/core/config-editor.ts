import { computed, ref, shallowRef } from 'vue';
import { applyOperation } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
import { get, patch, providerd } from './api/client.js';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type ConfigObject = { [key: string]: Json };
export type ConfigOwner = 'wishd' | 'providerd';
export type ConfigOperation =
  | { op: 'add' | 'replace'; path: string; value: Json }
  | { op: 'remove'; path: string };
export interface EditableConfig { revision: string; config: ConfigObject }
export interface SavedConfig extends EditableConfig {
  config_generation: string;
  restart_required: string[];
}
export interface ProviderPreset {
  id: string;
  provider: string;
  region: string;
  billing: string;
  protocols: string[];
  api_key_required: boolean;
  required_credentials: string[];
}
export interface ConfigCatalog { presets: ProviderPreset[]; protocols: string[] }

export const pointer = (path: readonly string[]) =>
  '/' + path.map(part => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
export function atPath(root: Json, path: readonly string[]): Json | undefined {
  let value: Json | undefined = root;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = Array.isArray(value) ? value[Number(key)] : value[key];
  }
  return value;
}
export const isObject = (value: unknown): value is ConfigObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// API ownership stays here. The editor never routes providerd writes through wishd.
const clients = {
  wishd: { get, patch },
  providerd,
};
export async function loadConfigCatalog(): Promise<ConfigCatalog> {
  const [presets, protocols] = await Promise.all([
    providerd.get('/provider-presets'), providerd.get('/protocols'),
  ]);
  return {
    presets: presets.presets,
    protocols: protocols.protocols.map((item: { protocol_id: string }) => item.protocol_id),
  };
}

function createConfigEditor(owner: ConfigOwner) {
  const source = shallowRef<EditableConfig>();
  const draft = shallowRef<ConfigObject>();
  const operations = shallowRef<ConfigOperation[]>([]);
  const busy = ref(false);
  const error = shallowRef<unknown>();
  const saved = shallowRef<SavedConfig>();
  const epoch = ref(0);
  const dirty = computed(() => operations.value.length > 0);

  function accept(value: EditableConfig) {
    source.value = value;
    draft.value = structuredClone(value.config);
    operations.value = [];
    epoch.value++;
  }
  async function load() {
    if (busy.value) return;
    busy.value = true;
    error.value = undefined;
    try {
      accept(await clients[owner].get('/config/editable'));
      saved.value = undefined;
    } catch (cause) {
      error.value = cause;
    } finally { busy.value = false; }
  }
  function edit(operation: ConfigOperation) {
    if (busy.value || !draft.value) throw new Error('Configuration is not ready for editing');
    // Apply only the changed field. A whole redacted provider object must never
    // be sent back when an adjacent provider is deleted or its index changes.
    const next = structuredClone(draft.value);
    applyOperation(next, operation as Operation, true);
    draft.value = next;
    operations.value = [...operations.value, structuredClone(operation)];
    saved.value = undefined;
  }
  function set(path: string[], value: Json) {
    if (Object.is(atPath(draft.value!, path), value)) return;
    const parent = atPath(draft.value!, path.slice(0, -1));
    edit({ op: Array.isArray(parent) ? 'replace' : 'add', path: pointer(path), value });
  }
  function remove(path: string[]) { edit({ op: 'remove', path: pointer(path) }); }
  function append(path: string[], value: Json) {
    edit({ op: 'add', path: pointer([...path, '-']), value });
  }
  function discard() {
    if (busy.value) return;
    if (source.value) accept(source.value);
    saved.value = undefined;
    error.value = undefined;
  }
  async function save() {
    if (busy.value || !dirty.value || !source.value) return;
    busy.value = true;
    error.value = undefined;
    const previousRevision = source.value.revision;
    try {
      const result: SavedConfig = await clients[owner].patch('/config/editable', {
        revision: previousRevision,
        operations: operations.value,
      });
      accept({ revision: result.revision, config: result.config });
      // Both daemons edit one file but own disjoint roots. A tab read at the
      // same revision remains current after our own successful sibling edit.
      // An older snapshot stays stale so external changes still cause 409.
      const other = configEditors[owner === 'wishd' ? 'providerd' : 'wishd'];
      if (other.source.value?.revision === previousRevision) {
        other.source.value = { ...other.source.value, revision: result.revision };
      }
      saved.value = result;
    } catch (cause) {
      // A conflict or rejected configuration leaves all entered values intact.
      error.value = cause;
    } finally { busy.value = false; }
  }
  return { owner, source, draft, operations, busy, error, saved, epoch, dirty,
    load, edit, set, remove, append, discard, save };
}

// In-memory drafts survive tab/route changes, but are never persisted to storage.
export const configEditors = {
  wishd: createConfigEditor('wishd'),
  providerd: createConfigEditor('providerd'),
};
export type ConfigEditor = ReturnType<typeof createConfigEditor>;
