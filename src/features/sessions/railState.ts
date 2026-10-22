// The handoff between the rail that floats beside the log and the rows that hold what it opens:
// the rail asks for a chip (and, when it knows it, the step of it) to open; ChatLog carries the
// request to the HistoryChips hosting that chip's window.
import type { InjectionKey, Ref } from 'vue';

// `solo` asks for that step's own window alone: a node that stands for one event opens it and
// never the list behind it.
export interface RailOpen { chipKey: string; stepKey: string | null; tick: number; solo?: boolean }
export const railOpenKey: InjectionKey<Ref<RailOpen | null>> = Symbol('rail open');
