import * as api from '../../core/api/endpoints.ts';
import { bus } from '../../core/bus.ts';
import { saveAttachmentDrafts } from '../../core/attachments.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';

/** Deletes a session: its row leaves the list, and an open conversation with it closes. */
export async function deleteSession(id: string) {
  await sessions.removeRow(id, () => api.sessionDelete(id));
  finalizeRemovedSession(id);
}
export function finalizeRemovedSession(id: string) {
  chat.forgetConversation(id);
  saveAttachmentDrafts(id, []);
  bus.emit('tombstone.session', { id });
  if (chat.sessionId.value === id) chat.close(false);
}
