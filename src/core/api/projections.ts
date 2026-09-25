import { orderedUserContent, type ContentBlock } from './userContent.ts';
import { operationFailure, type DisplayFailure } from './failures.ts';
export type { ContentBlock } from './userContent.ts';

// Native session settings; nested protocol values stay raw.
export interface SessionConfig {
  model: string;
  stream: boolean;
  tools: any[];
  max_output_tokens: number | null;
  reasoning: { enabled?: boolean | null; effort?: string | null; summary?: string | null } | null;
  cache: any;
  run: { tools: 'Serial' | 'Parallel' };
  compaction?: any;
}
export interface SessionDescriptor {
  id: string;
  name: string;
  provider: string;
  revision: number;
  created_at: number;
  updated_at: number;
  cwd: string;
  shell: boolean;
  /** This session's own shell; absent while it follows the application's. */
  shell_command?: { program: string; args: string[] | null };
  pending_selection?: unknown;
}
export type SessionPhase = 'compacting' | 'running' | 'queued' | 'idle';
export interface SessionView {
  id: string; name: string; provider: string; model: string;
  reasoning_effort: string | undefined; metadata: any;
  phase: SessionPhase; running: boolean; queue: number; pending_items: number;
  revision: number; created_at: number; updated_at: number;
  created_at_ms: number; updated_at_ms: number;
  resume_requires_user: boolean; compaction_count: number;
  standby_preparing: boolean;
  context_tokens: number | null;
  last_error: DisplayFailure | null;
  agent_custom: any; config: SessionConfig; descriptor: SessionDescriptor; status: any;
}
export type EntryKind = 'run_error' | 'history_event' | 'system_message' | 'developer_message' | 'user_message' | 'assistant_message' | 'tool_result';
export interface EntryPayload {
  content: ContentBlock[];
  failure?: DisplayFailure | null;
  tool_name?: string;
  tool_call_id?: string;
  background?: boolean;
  command?: string;
  result?: any;
  metadata?: any;
}
export interface EntryView {
  seq: number; id: number | string; run_id?: number | null;
  created_at: number; kind: EntryKind; payload: EntryPayload;
}
// A configured provider as the pickers read it; the remaining settings pass through.
export interface ProviderView {
  id: string;
  display_name?: string | null;
  preset: string;
  enabled: boolean;
  model_catalog_available: boolean;
  reasoning_efforts: Record<string, string | number>;
  reasoning_efforts_source: 'provider';
  models: Record<string, any>;
}

// Native wish-core values -> display models. No old backend protocol is sent or accepted.
export function sessionView(value: any): SessionView {
  const { session, status } = value;
  const config = status.config;
  const phase = status.phase === 'Compacting' ? 'compacting' : status.running ? 'running' : status.phase === 'Ready' ? 'queued' : 'idle';
  return {
    id: session.id, name: session.name, provider: session.provider, model: config.model,
    reasoning_effort: config.reasoning?.effort, metadata: status.metadata,
    phase, running: status.running, queue: status.queue_count, pending_items: status.queue_count,
    revision: session.revision, created_at: session.created_at, updated_at: session.updated_at,
    created_at_ms: session.created_at, updated_at_ms: session.updated_at,
    resume_requires_user: status.phase === 'Suspended', compaction_count: status.active_generation ?? 0,
    standby_preparing: Boolean(status.standby_preparing),
    // Input size of the last conversation call in the active context; null until one completes.
    context_tokens: status.context_tokens ?? null,
    last_error: operationFailure(status.last_operation),
    agent_custom: status.metadata?.agent_custom, config, descriptor: session, status,
  };
}
export function entryView(item: any, sessionId: string): EntryView {
  if (item.content.kind === 'event') {
    const failure = operationFailure({outcome: item.content.value.Finished});
    return {seq: item.record.sequence, id: `event-${item.record.sequence}`,
      created_at: item.record.recorded_at, kind: failure ? 'run_error' : 'history_event',
      payload: {failure, content: []}};
  }
  const entry = item.content.value;
  const [type, message] = Object.entries<any>(entry.message)[0];
  const result: EntryView = { seq: item.record.sequence, id: entry.id, run_id: item.record.model_call_id,
    created_at: item.record.recorded_at, kind: 'system_message', payload: { content: [] } };
  const blocks = (content: any[] | undefined): ContentBlock[] => (content ?? []).map(block => block.Text ? { type: 'text', text: block.Text.text } : { type: 'image', ...block.Image });
  switch (type) {
    case 'Developer':
    case 'User': {
      if (message.metadata?.source === 'background_execution_finished') {
        const raw = (message.content ?? []).filter((b: any) => b.Text).map((b: any) => b.Text.text).join('\n');
        let completion = message.metadata?.completion;
        if (!completion) { try { completion = JSON.parse(raw.slice(raw.indexOf('\n') + 1)); } catch {} }
        result.kind = 'developer_message';
        result.payload = {tool_name:'shell',background:true,command:completion?.command,
          result:completion?.result ? {status:'success',output:completion.result} : undefined,
          content:[{type:'text',text:raw}]};
      } else { result.kind = type === 'Developer' ? 'developer_message' : 'user_message'; result.payload.content = blocks(message.content); }
      break;
    }
    case 'Assistant': result.kind = 'assistant_message'; result.payload.content = blocks(message.content); break;
    case 'Reasoning': result.kind = 'assistant_message'; result.payload.content = [{ type: 'reasoning', display_summary: message.display != null, text: message.display || message.plaintext }]; break;
    case 'ToolUse': result.kind = 'assistant_message'; result.payload.content = [{ type: 'tool_call', id: message.call_id, name: message.name, arguments: message.arguments }]; break;
    case 'ToolResult': result.kind = 'tool_result'; result.payload = { tool_name: message.name, tool_call_id: message.call_id, result: message.content, metadata: message.metadata, content: [{ type: 'text', text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2) }] }; break;
    case 'UpstreamCompaction': result.payload.content = [{ type: 'text', text: 'Upstream compacted context' }]; break;
    default: result.payload.content = blocks(message.content);
  }
  if (type === 'User' && Array.isArray(message.metadata?.input_parts)) {
    result.payload.content = orderedUserContent(message, sessionId, result.payload.content);
    return result;
  }
  const files = message.metadata?.attachments?.filter((a: any) => a.kind === 'file') ?? [];
  if (files.length) result.payload.content.push(...files.map((a: any) => ({ type: 'file', blob_id: `${sessionId}/${a.id}`, filename: a.name, byte_count: a.byte_count })));
  return result;
}
export function providerView(p: any): ProviderView {
  return { ...p, preset: p.preset ?? '', enabled: p.enabled, model_catalog_available: !!p.model_list,
    reasoning_efforts: p.reasoning_efforts ?? {}, reasoning_efforts_source: 'provider', models: p.models ?? {} };
}
