// A single guard owns each visible terminal, shared by sidebar and route navigation.
const guards = new Map<string, () => Promise<boolean>>();
export function registerTerminalLeave(session: string, guard: () => Promise<boolean>) {
  guards.set(session, guard);
  return () => {
    if (guards.get(session) === guard) guards.delete(session);
  };
}
export const leaveSessionTerminal = (session: string) => guards.get(session)?.() ?? Promise.resolve(true);

/** Cached chat pages also need a guard when leaving an overlay for another session. */
export async function leaveOtherSessionTerminals(keepSession: string) {
  for (const [session, guard] of guards) {
    if (session !== keepSession && !(await guard())) return false;
  }
  return true;
}
