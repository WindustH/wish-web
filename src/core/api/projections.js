import { orderedUserContent } from './userContent.js';
import { operationFailure } from './failures.js';
// Native wish-core values -> display models. No old backend protocol is sent or accepted.
export function sessionView(value) {
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
export function entryView(item, sessionId) {
  if (item.content.kind === 'event') {
    const failure = operationFailure({outcome: item.content.value.Finished});
    return {seq: item.record.sequence, id: `event-${item.record.sequence}`,
      created_at: item.record.recorded_at, kind: failure ? 'run_error' : 'history_event',
      payload: {failure, content: []}};
  }
  const entry = item.content.value;
  const [type, message] = Object.entries(entry.message)[0];
  const result = { seq: item.record.sequence, id: entry.id, run_id: item.record.model_call_id,
    created_at: item.record.recorded_at, kind: 'system_message', payload: { content: [] } };
  const blocks = content => (content ?? []).map(block => block.Text ? { type: 'text', text: block.Text.text } : { type: 'image', ...block.Image });
  switch (type) {
    case 'Developer':
    case 'User': {
      if (message.metadata?.source === 'background_execution_finished') {
        const raw = (message.content ?? []).filter(b => b.Text).map(b => b.Text.text).join('\n');
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
  const files = message.metadata?.attachments?.filter(a => a.kind === 'file') ?? [];
  if (files.length) result.payload.content.push(...files.map(a => ({ type: 'file', blob_id: `${sessionId}/${a.id}`, filename: a.name, byte_count: a.byte_count })));
  return result;
}
export function providerView(p) {
  return { ...p, preset: p.preset ?? '', enabled: p.enabled, model_catalog_available: !!p.model_list,
    reasoning_efforts: p.reasoning_efforts ?? {}, reasoning_efforts_source: 'provider', models: p.models ?? {} };
}
