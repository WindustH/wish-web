// "Notify me when a run fails": while the page is in the background, a system
// notification for each run that ends in failure. Off by default.
import { prefs } from '../core/state/prefsSlice.js';
import { bus } from '../core/bus.js';
import { i18n } from '../core/i18n/index.js';
import { createRunFailureWatch } from '../core/runFailures.js';
import { platform } from '../platform/index.js';
import { announce } from './live.js';

export function installBackgroundNotify() {
  const failures = createRunFailureWatch();
  bus.on('upsert.session', (update: any) => {
    const session = update?.body;
    const failure = failures.observe(session);
    if (!failure) return;
    const title = i18n.t('notify.runFailed', { name: session.name || session.id });
    announce(title);
    if (!prefs.notifyOnFailure.value || !platform('app').isHidden()) return;
    const notify = platform('notify');
    if (notify.permission() !== 'granted') return;
    try {
      notify.show({ title, body: failure.message, tag: `wish-run-failed-${session.id}` });
    } catch (error) { console.warn('[notify]', error); }
  });
  bus.on('tombstone.session', (event: any) => { if (event?.id) failures.forget(event.id); });
}
