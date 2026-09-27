// "Notify me when I'm needed": while the page is in the background, a system
// notification for each run that ends in failure and each question the model
// asks through ask_user. Off by default.
import { prefs } from '../core/state/prefsSlice.ts';
import { bus } from '../core/bus.ts';
import { i18n } from '../core/i18n/index.ts';
import { createRunFailureWatch } from '../core/runFailures.ts';
import { tr } from '../core/i18n/tr.ts';
import { createQuestionWatch } from '../features/sessions/askUser.ts';
import { platform } from '../platform/index.ts';
import { announce } from './live.ts';

function show(title: string, body: string, tag: string) {
  if (!prefs.notifyOnFailure.value || !platform('app').isHidden()) return;
  const notify = platform('notify');
  if (notify.permission() !== 'granted') return;
  try {
    notify.show({ title, body, tag });
  } catch (error) { console.warn('[notify]', error); }
}

export function installBackgroundNotify() {
  const failures = createRunFailureWatch();
  const questions = createQuestionWatch();
  bus.on('upsert.session', (update: any) => {
    const session = update?.body;
    const name = session?.name || session?.id;
    const failure = failures.observe(session);
    if (failure) {
      const title = i18n.t('notify.runFailed', { name });
      announce(title);
      show(title, failure.message, `wish-run-failed-${session.id}`);
    }
    for (const form of questions.observe(session)) {
      const title = tr(`「${name}」在等你回答`, `${name} is waiting for your answer`);
      announce(title);
      show(title, form.questions.map(item => item.question).join('\n'), `wish-question-${form.call_id}`);
    }
  });
  bus.on('tombstone.session', (event: any) => {
    if (!event?.id) return;
    failures.forget(event.id);
    questions.forget(event.id);
  });
}
