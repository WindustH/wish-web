// Hash router: works from file://, inside PWA standalone, and inside
// Tauri/Capacitor webviews without server rewrites.
// Features register routes; navigation is pure data → trivially testable.
import { signal } from '../core/state/reactive.js';
import { cfg } from '../core/config.js';

const routes = [];          // { pattern, regex, keys, view }
let fallback = { path: '/sessions', view: null };   // default landing
export const current = signal({ path: '/', params: {}, query: {} });
export const isMobile = signal(false);

export function registerRoute(pattern, view) {
  const keys = [];
  const regexSrc = pattern
    .split('/')
    .map((seg) => {
      const m = seg.match(/^:(\w+)$/);
      if (m) { keys.push(m[1]); return '([^/]+)'; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({ pattern, regex: new RegExp(`^${regexSrc}$`), keys, view });
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = {};
  for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  return { path: path || '/', query };
}

function resolve() {
  const { path, query } = parseHash();
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      current.value = { path, params, query, view: r.view };
      return;
    }
  }
  // No feature claimed the path (bare load, typo, or '/'): land on the
  // default view without polluting history.
  if (fallback.view && (path === '/' || !routes.length)) {
    if (path !== fallback.path) navigate(fallback.path, { replace: true });
    current.value = { path: fallback.path, params: {}, query, view: fallback.view };
    return;
  }
  current.value = { path, params: {}, query, view: fallback.view };
}

// Fallback view: what renders when nothing matches (default landing).
export function setFallback(path, view) { fallback = { path, view }; }

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) location.replace(target);
  else if (location.hash !== target) location.hash = target;
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  const applyMobile = () => {
    isMobile.value = window.innerWidth < cfg.breakpoints.desktop;
  };
  window.addEventListener('resize', applyMobile, { passive: true });
  applyMobile();
  resolve();
}

export function back() { history.back(); }
