import { onUnmounted } from 'vue';
import { chat } from '../../core/state/chatSlice.ts';

/**
 * Requests a pane makes for the open session, when the pane may unmount or the session switch
 * under it. An answer may only land while the pane is mounted, the session is still the one it
 * was asked for, and - for `begin` - no later request has started since.
 */
export function useSessionRequests() {
  let generation = 0;
  let alive = true;
  onUnmounted(() => { alive = false; generation++; });
  const owns = (sid: string | null | undefined) => alive && !!sid && chat.sessionId.value === sid;
  return {
    owns,
    /** Starts a request for `sid`; the check says whether its answer may still land. */
    begin(sid: string | null | undefined) {
      const mine = ++generation;
      return () => mine === generation && owns(sid);
    },
    /** Drops every answer still on its way. */
    invalidate() { generation++; },
  };
}
