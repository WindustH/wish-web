// Background notifications (round-4 #3, round-5 corrections): fire ONLY
// while the page is hidden, only for (a) FAILED runs and (b) sessions
// flipping INTO resume-requires-user. Baselines come from the control-plane
// SNAPSHOT first, so a reconnect/page-reopen never re-notifies old terminal
// state; user-initiated interruptions (aborted) are NOT failures.
// Default OFF via prefs.notifyOnFailure + explicit permission grant.
import { platform } from '../platform/index.js';
import { bus } from '../core/bus.js';
import { i18n } from '../core/i18n/index.js';
import { prefs } from '../core/state/prefsSlice.js';

const RUN_FAIL_STATES = ['failed'];

export function installBackgroundNotify() {
  const app = platform('app');
  const notify = platform('notify');
  const seenRuns = new Set();        // run ids already handled
  const resumePrev = new Map();      // session id → last resume_requires_user
  let snapshotted = false;

  const enabled = () =>
    prefs.notifyOnFailure.value &&
    notify?.isSupported &&
    notify.permission() === 'granted' &&
    app.isHidden();

  const show = (payload) => {
    notify.show(payload);   // may throw → caller-visible failure, never swallowed
  };

  // Authoritative baseline: seed from the first sync.snapshot so that state
  // which was ALREADY true before we attached (old failed runs, sessions
  // already waiting for confirmation) is never notified again.
  const onSnapshot = (payload) => {
    snapshotted = true;
    for (const r of payload?.runs?.items ?? []) {
      if (r?.state && RUN_FAIL_STATES.includes(r.state) && r.id) seenRuns.add(r.id);
    }
    for (const s of payload?.sessions?.items ?? []) {
      if (s?.id) resumePrev.set(s.id, Boolean(s.resume_requires_user));
    }
  };

  bus.on('sync.snapshot', onSnapshot);

  bus.on('upsert.run', (u) => {
    const r = u?.body;
    if (!r?.id || !RUN_FAIL_STATES.includes(r.state)) return;
    if (!snapshotted || seenRuns.has(r.id)) return;   // pre-snapshot state → baseline only
    seenRuns.add(r.id);
    if (!enabled()) return;              // visible → the UI already shows it
    show({ title: i18n.t('notify.runFailed'), body: r.id.slice(0, 8), tag: `wish-run-${r.id}` });
  });

  bus.on('upsert.session', (u) => {
    const s = u?.body;
    if (!s?.id || typeof s.resume_requires_user !== 'boolean') return;
    const prev = resumePrev.get(s.id);
    resumePrev.set(s.id, s.resume_requires_user);
    if (!snapshotted || prev == null) return;         // unknown start state → no notify
    if (prev === s.resume_requires_user || !s.resume_requires_user) return;
    if (!enabled()) return;
    show({ title: i18n.t('notify.needsConfirm'), body: s.name || s.id.slice(0, 8), tag: `wish-resume-${s.id}` });
  });
}
