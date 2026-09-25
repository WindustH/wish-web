// "Notify me when a run fails": while the page is in the background, a system
// notification for each run that ends in failure. Off by default.
import { prefs } from '../core/state/prefsSlice.ts';
import { bus } from '../core/bus.ts';
import { i18n } from '../core/i18n/index.ts';
import { createRunFailureWatch } from '../core/runFailures.ts';
import { platform } from '../platform/index.ts';
import { announce } from './live.ts';

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
