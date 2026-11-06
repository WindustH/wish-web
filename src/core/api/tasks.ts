import { get, post } from './client.ts';

export interface TaskProcess {
  status: 'running' | 'exited' | 'killed' | 'interrupted' | 'unknown';
  exit_code: number | null;
  term_signal: number | null;
  error: string | null;
}
export interface BackgroundTask {
  task_id: string;
  command: string;
  started_at: number;
  background: boolean;
  process: TaskProcess;
}
export interface TaskOutput {
  process: TaskProcess;
  text: string;
  output_bytes: number;
  next_offset: number;
}
const path = (session: string) => `/sessions/${encodeURIComponent(session)}/tasks`;
export const sessionTasks = (session: string, signal: AbortSignal): Promise<{ tasks: BackgroundTask[] }> =>
  get(path(session), { signal });
export const taskOutput = (
  session: string,
  taskId: string,
  offset: number,
  maxBytes: number,
  signal: AbortSignal,
): Promise<TaskOutput> =>
  post(
    path(session),
    {
      action: 'execute',
      operation: { operation: 'poll', execution_id: taskId, offset, max_bytes: maxBytes, wait_ms: 0, encoding: 'utf8' },
    },
    { signal },
  );

export const terminateTask = (
  session: string,
  taskId: string,
  mode: 'graceful' | 'force',
): Promise<{ execution_id: string; process: TaskProcess }> =>
  post(path(session), {
    action: 'execute',
    operation: { operation: 'kill', execution_id: taskId, mode },
  });
