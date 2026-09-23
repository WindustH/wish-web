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

const adapters = {};

export function use(name, adapter) {
  adapters[name] = Object.freeze(adapter);
}

export function platform(name) {
  const a = adapters[name];
  if (!a) throw new Error(`platform adapter "${name}" not registered`);
  return a;
}

export function tryPlatform(name) { return adapters[name] || null; }
