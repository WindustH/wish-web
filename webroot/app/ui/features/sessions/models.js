// Shared provider/model loading: the new-session modal and the per-session
// model settings use ONE implementation.
//  · provider switches are generation-guarded — a late catalog response for
//    a previously selected provider can never clobber the current one;
//  · load FAILURES stay errors (retriable) and never masquerade as empty
//    model lists; switching provider clears the previous provider's error
//    and reloads its own catalog;
//  · the session's CURRENT model is kept selectable even when the catalog
//    doesn't list it (kept as an explicit "current" entry).
import { useState, useEffect, useRef } from 'preact/hooks';
import * as api from '../../../core/api/endpoints.js';

export function useProviderModels({ initialProvider = '' } = {}) {
  const [providers, setProviders] = useState(null);   // null = loading
  const [provider, setProvider] = useState(initialProvider);
  const [models, setModels] = useState(null);         // null = loading, [] = none listed
  const [loadErr, setLoadErr] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const providerGen = useRef(0);

  useEffect(() => {
    let alive = true;
    api.providerConfigs().then((d) => {
      if (!alive) return;
      const list = d.providers.filter((p) => p.enabled !== false);
      setProviders(list);
      setProvider((cur) => cur || (list[0]?.id ?? ''));
    }).catch((e) => { if (alive) setLoadErr(e); });
    return () => { alive = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!providers) return;
    if (!provider || providers.length === 0) { setModels([]); return; }
    const gen = ++providerGen.current;   // invalidates the previous catalog request
    let alive = true;
    setLoadErr(null);                    // a provider switch retries on its own
    const cfgp = providers.find((p) => p.id === provider);
    const explicit = Object.keys(cfgp?.models || {});
    if (explicit.length) {
      setModels(explicit.map((id) => ({ id, source: 'configured' })));
      return () => { alive = false; };
    }
    setModels(null);
    api.providerModels(provider).then((d) => {
      if (!alive || providerGen.current !== gen) return;
      setModels(d.models
        .filter((m) => m.allowed_for_provider !== false)
        .map((m) => ({ id: m.id, source: 'catalog' })));
    }).catch((e) => {
      if (!alive || providerGen.current !== gen) return;
      setLoadErr(e);                     // failure ≠ empty list
      setModels([]);
    });
    return () => { alive = false; };
  }, [provider, providers, reloadKey]);

  const retry = () => { setLoadErr(null); setProviders(null); setModels(null); setReloadKey((k) => k + 1); };
  const loading = providers === null || (models === null && loadErr === null);
  return { providers, provider, setProvider, models, loading, loadErr, retry };
}

/** Keep the session's current model selectable even when the catalog does
 *  not list it — never silently drop to another choice. */
export function withCurrent(models, currentId) {
  if (!currentId) return models ?? [];
  if ((models ?? []).some((m) => m.id === currentId)) return models;
  return [{ id: currentId, source: 'current' }, ...(models ?? [])];
}
