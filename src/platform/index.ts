// Platform adapter registry. The UI and core features depend on these
// interfaces only; the browser implementation is the default provider.
// A Tauri/Capacitor shell injects native implementations via `use()` —
// no feature code changes.
//
// Interfaces (all async/optional unless noted):
//   storage  { get(key), set(key,value), remove(key), keys(), clear() }
//   notify   { isSupported, permission(), request(), show({title,body,tag}) }
//   fs       { pickFiles({multiple}) -> [{name,mime,size,read()}] }
//   app      { isHidden(), promptInstall(), keepAwake(bool) }

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
  clear(): void;
}

export type NotifyPermission = NotificationPermission | 'unsupported';
export interface NotifyOptions { title: string; body?: string; tag?: string; silent?: boolean }
export interface NotifyAdapter {
  readonly isSupported: boolean;
  permission(): NotifyPermission;
  request(): Promise<NotifyPermission>;
  show(options: NotifyOptions): boolean;
}

export interface PickFilesOptions { multiple?: boolean; accept?: string }
export interface PickedFile { name: string; mime: string; size: number; read(): Promise<ArrayBuffer> }
export interface FsAdapter { pickFiles(options?: PickFilesOptions): Promise<PickedFile[]> }

export interface ClipboardAdapter { writeText(text: string): Promise<void> }

export interface AppAdapter {
  isHidden(): boolean;
  promptInstall(): Promise<boolean>;
  keepAwake(on: boolean): Promise<boolean>;
}

export interface PlatformAdapters {
  storage: StorageAdapter;
  notify: NotifyAdapter;
  fs: FsAdapter;
  clipboard: ClipboardAdapter;
  app: AppAdapter;
}
export type PlatformName = keyof PlatformAdapters;

const adapters: Partial<PlatformAdapters> = {};

export function use<K extends PlatformName>(name: K, adapter: PlatformAdapters[K]): void {
  adapters[name] = Object.freeze(adapter) as PlatformAdapters[K];
}

export function platform<K extends PlatformName>(name: K): PlatformAdapters[K] {
  const a = adapters[name];
  if (!a) throw new Error(`platform adapter "${name}" not registered`);
  return a;
}

export function tryPlatform<K extends PlatformName>(name: K): PlatformAdapters[K] | null { return adapters[name] || null; }
