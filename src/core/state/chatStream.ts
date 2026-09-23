import { operationFailure } from '../api/failures.js';
// Stream event processing and live execution state for chat sessions.
import { toast } from '../../ui/toast.js';
import { i18n } from '../i18n/index.js';

export interface ToolCallData {
  name: string;
  args: string;
}

export interface StreamState {
  active: boolean;
  phase: 'idle' | 'pending' | 'streaming';
  activity: 'working' | 'writing' | 'thinking' | 'tool';
  text: string;
  reasoning: string;
  toolCalls: Record<string | number, ToolCallData>;
  currentTool: string | null;
  usage: any;
  error: any;
  gap: boolean;
  startedAt: number;
  standbyPreparing: boolean;
}

export function createEmptyStream(): StreamState {
  return {
    active: false,
    phase: 'idle',
    activity: 'working',
    text: '',
    reasoning: '',
    toolCalls: {},
    currentTool: null,
    usage: null,
    error: null,
    gap: false,
    startedAt: 0,
    standbyPreparing: false,
  };
}

export interface StreamCallbacks {
  onClose: () => void;
  onScheduleRefresh: () => void;
  onTurnComplete: (kind: string, turnVersion: number) => void;
  onError: (err: unknown) => void;
}

export function createStreamProcessor(callbacks: StreamCallbacks) {
  let turnVersion = 0;
  let reasoningBlocks = new Map<number, { plain: string; display: string }>();

  function reset() {
    turnVersion = 0;
    reasoningBlocks.clear();
  }

  function getTurnVersion() {
    return turnVersion;
  }

  function processFrame(frameData: string, current: StreamState): StreamState {
    try {
      const data = JSON.parse(frameData);

      if (data.type === 'deleted') {
        callbacks.onClose();
        return current;
      }

      if (data.type === 'snapshot' && Array.isArray(data.live_events)) {
        turnVersion++;
        reasoningBlocks.clear();
        let next = { ...createEmptyStream(), active: !!data.data?.status?.running };
        for (const event of data.live_events) {
          next = processFrame(JSON.stringify({ type: 'session_event', event }), next);
        }
        callbacks.onScheduleRefresh();
        return next;
      }

      if (data.type === 'snapshot' || data.type === 'gap') {
        callbacks.onScheduleRefresh();
        return { ...current, gap: data.type === 'gap' };
      }

      if (data.type === 'operation_failed' || data.type === 'operation_finished') {
        callbacks.onScheduleRefresh();
        return { ...current, active: false, phase: 'idle', error: operationFailure(data) };
      }

      if (data.type !== 'session_event') {
        return current;
      }

      const [kind, event] = Object.entries(data.event)[0] as [string, any];

      if (kind === 'TurnStarted') {
        turnVersion++;
        reasoningBlocks.clear();
        return {
          ...createEmptyStream(),
          active: true,
          phase: 'streaming',
          startedAt: Date.now(),
        };
      }

      if (kind === 'ModelStream') {
        const [type, value] = Object.entries(event)[0] as [string, any];

        if (type === 'TextDelta') {
          return {
            ...current,
            active: true,
            phase: 'streaming',
            activity: 'writing',
            text: current.text + value.delta,
          };
        }

        if (type === 'ReasoningDelta' || type === 'ReasoningDisplayDelta') {
          const block = reasoningBlocks.get(value.index) ?? { plain: '', display: '' };
          if (type === 'ReasoningDelta') {
            block.plain += value.delta;
          } else {
            block.display += value.delta;
          }
          reasoningBlocks.set(value.index, block);
          return {
            ...current,
            active: true,
            phase: 'streaming',
            activity: 'thinking',
            reasoning: [...reasoningBlocks.values()].map(b => b.display || b.plain).join('\n'),
          };
        }

        if (type === 'ToolUseDelta') {
          const calls = { ...current.toolCalls };
          const previous = calls[value.index] ?? { name: '', args: '' };
          calls[value.index] = {
            name: value.name ?? previous.name,
            args: previous.args + value.arguments,
          };
          return {
            ...current,
            activity: 'tool',
            toolCalls: calls,
            currentTool: calls[value.index].name,
          };
        }

        if (type === 'Usage') {
          return { ...current, usage: value };
        }
      }

      if (kind === 'ToolStarted') {
        return {
          ...current,
          activity: 'tool',
          currentTool: event.name,
        };
      }

      if (kind === 'CompactionSummaryStarted') {
        return { ...current, standbyPreparing: true };
      }

      if (kind === 'CompactionSummary') {
        toast(i18n.t('notify.standbySummaryReady', { start: event.source_start, end: event.source_end }));
        return { ...current, standbyPreparing: false };
      }

      if (kind === 'ContextCompacted') {
        toast(i18n.t('notify.contextCompacted', { n: event.removed_entries }));
        return { ...current, standbyPreparing: false };
      }

      if (['ResponseAccepted', 'ResponseInterrupted', 'ToolFinished', 'Finished', 'ContextCompacted'].includes(kind)) {
        callbacks.onTurnComplete(kind, turnVersion);
        callbacks.onScheduleRefresh();
      }

      return current;
    } catch (cause) {
      callbacks.onError(cause);
      return current;
    }
  }

  return {
    processFrame,
    reset,
    getTurnVersion,
  };
}
