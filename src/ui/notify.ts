// Background notifications (decisions 22): default OFF, user opt-in,
// document-hidden only, deduped. Resume-required flips.
import { watch } from 'vue';
import { prefs } from '../core/state/prefsSlice.js';
import { sync } from '../core/state/syncSlice.js';
import { bus } from '../core/bus.js';
import { i18n } from '../core/i18n/index.js';
import { platform } from '../platform/index.js';
import { announce } from './live.js';

export function installBackgroundNotify() {
  const resumePrev = new Map<string, boolean>();
  let snapshotted = false;

  const maybeNotify = (title: string, tag: string) => {
    if (!prefs.notifyOnFailure.value) return;
    const notify = platform('notify');
    if (notify.permission() !== 'granted') return;
    if (!platform('app').isHidden()) return;
    notify.show({ title, tag }).catch((err: unknown) => console.warn('[notify]', err));
  };

  // Baseline from the first authoritative snapshot so reconnects neither
  // spam old terminal states nor miss genuine flips.
  bus.on('sync.snapshot', (payload: any) => {
    for (const s of payload?.sessions?.items ?? []) {
      resumePrev.set(s.id, Boolean(s.resume_requires_user));
    }
    snapshotted = true;
  });

  bus.on('upsert.session', (u: any) => {
    if (!snapshotted) return;
    const id = u?.body?.id;
    if (!id) return;
    const now = Boolean(u.body.resume_requires_user);
    const prev = resumePrev.get(id) ?? false;
    resumePrev.set(id, now);
    if (!prev && now) {
      maybeNotify(i18n.t('notify.needsConfirm'), `wish-session-${id}`);
      announce(i18n.t('notify.needsConfirm'));
    }
  });

  // Keep the baseline fresh when the control plane reconnects.
  watch(sync.state, () => { if (sync.state.value === 'open') snapshotted = true; });
}
