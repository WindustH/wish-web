// Feature registry — the extension point. Adding a new screen means:
//   1. create webroot/app/ui/features/<name>/
//   2. export default { id, nav(order), routes: [{pattern, view}] }
//   3. add it to FEATURES below.
// The shell, router and state slices never change.
import { registerRoute, setFallback } from '../router.js';
import sessionsFeature from './sessions/index.js';
import { SessionsView } from './sessions/list.js';
import statsFeature from './stats/index.js';
import settingsFeature from './settings/index.js';
import selftestFeature from './selftest/index.js';

export const FEATURES = [sessionsFeature, statsFeature, settingsFeature, selftestFeature];

export function installFeatures() {
  for (const f of FEATURES) {
    for (const r of f.routes) registerRoute(r.pattern, r.view);
  }
  // Default landing: unmatched/empty hash opens the session browser.
  setFallback('/sessions', SessionsView);
}
