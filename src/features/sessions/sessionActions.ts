import * as api from '../../core/api/endpoints.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';
import { chat } from '../../core/state/chatSlice.ts';

/** Deletes a session: its row leaves the list, and an open conversation with it closes. */
export async function deleteSession(id: string) {
  await api.sessionDelete(id);
  sessions.dropRow(id);
  if (chat.sessionId.value === id) chat.close();
}
