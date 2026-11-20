// Session notices follow the global event stream, including sessions outside the current view.
import { prefs } from '../../core/state/prefsSlice.ts';
import { bus } from '../../core/bus.ts';
import { sessionNotice, type SessionNotice } from './sessionNotice.ts';
import { createRunFailureWatch } from '../../core/runFailures.ts';
import { createQuestionWatch } from '../../core/questionWatch.ts';
import { platform } from '../../platform/index.ts';
import { toast } from '../../ui/toast.ts';

async function show(sessionId: string, name: string, event: SessionNotice, tag: string) {
  const { text: title, detail: body, icon, tone } = sessionNotice(name || sessionId.slice(0, 8), event);
  if (!platform('app').isHidden()) {
    toast(title, { sessionId, detail: body, icon, tone });
    return;
  }
  if (!prefs.notifyOnFailure.value) return;
  const notify = platform('notify');
  if (notify.permission() !== 'granted') return;
  try {
    await notify.show({ title, body, tag });
  } catch (error) {
    console.warn('[notify]', error);
  }
}

export function installBackgroundNotify() {
  let failures = createRunFailureWatch();
  let questions = createQuestionWatch();
  const working = new Set<string>();
  let explicitFailures = false;
  const stopSnapshot = bus.on('sync.snapshot', ({ sessionFailures }) => {
    explicitFailures = !!sessionFailures;
    working.clear();
    failures = createRunFailureWatch();
    questions = createQuestionWatch();
  });
  const stopUpdates = bus.on('upsert.session', ({ body: session }) => {
    const { id, phase } = session;
    const name = session.name || id.slice(0, 8);
    const failure = failures.observe(session);
    const wasWorking = working.has(id);
    if (phase === 'running') working.add(id);
    else if (phase === 'idle' || phase === 'suspended') working.delete(id);

    const forms = questions.observe(session);
    if (failure && !explicitFailures) {
      void show(id, name, { kind: 'failed', detail: failure.message }, `wish-run-failed-${id}`);
    } else if (!session.last_error && wasWorking && phase === 'idle' && !forms.length) {
      void show(id, name, { kind: 'idle' }, `wish-session-idle-${id}`);
    }
    for (const form of forms) {
      void show(
        id,
        name,
        { kind: 'question', detail: form.questions.map((item) => item.question).join('\n') },
        `wish-question-${form.call_id}`,
      );
    }
  });
  const stopFailure = bus.on('session.failed', ({ id, name, failure }) => {
    void show(id, name, { kind: 'failed', detail: failure.message }, `wish-run-failed-${id}`);
  });
  const stopRetry = bus.on('session.retry', ({ id, name, retry }) => {
    void show(
      id,
      name,
      {
        kind: 'retry',
        operation: retry.operation,
        attempt: retry.retry,
        max: retry.maxRetries,
        detail: retry.failure?.message ?? '',
      },
      `wish-retry-${id}-${retry.requestId}-${retry.retry}`,
    );
  });
  const stopRecovery = bus.on('session.recovery', ({ id, name, attempt }) => {
    void show(id, name, { kind: 'recovery', attempt }, `wish-recovery-${id}-${attempt}`);
  });
  const stopDeletions = bus.on('tombstone.session', ({ id }) => {
    working.delete(id);
    failures.forget(id);
    questions.forget(id);
  });
  return () => {
    stopSnapshot();
    stopUpdates();
    stopFailure();
    stopRetry();
    stopRecovery();
    stopDeletions();
  };
}
