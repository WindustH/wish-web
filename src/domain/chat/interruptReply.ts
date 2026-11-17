import { chat } from '../../core/state/chatSlice.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { toast } from '../../ui/toast.ts';

const pending = new Set<string>();

/** The stop button and keyboard command share the same session and in-flight guard. */
export async function interruptReply(session: string) {
  if (!session || chat.sessionId.value !== session || !chat.stream.value.active || pending.has(session)) return;
  pending.add(session);
  try {
    await chat.interrupt();
  } catch (error) {
    toast(i18n.t('chat.stopFailed') + ': ' + describeError(error).message);
  } finally {
    pending.delete(session);
  }
}
