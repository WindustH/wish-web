import { get, post, patch, put, del, api, getBaseUrl, type RequestOptions } from './client.ts';
import { sessionView, entryView, providerView, type SessionView, type EntryView, type ProviderView } from './projections.ts';
import type { SeriesQuery, DailyQuery, UsageSeriesResponse, UsageDailyResponse } from '../usage/types.ts';

// Request options callers pass through; a raw body is set by the endpoint itself.
export type EndpointOptions = Omit<RequestOptions, 'body' | 'raw'>;
export interface SessionsListParams { cursor?: number | string | null; limit?: number; order?: string; query?: string; phase?: string; tag?: string }
export interface SessionsPage { items: SessionView[]; next_cursor: any; has_more: boolean }
export interface CreateSessionBody { provider: string; model: string; name?: string; cwd?: string; reasoning_effort?: string; agent_custom?: string }
export interface ModelChange { provider?: string; model?: string; reasoning_effort?: string }
export interface HistoryQuery { before?: number | null; after?: number | null; limit?: number; order?: 'asc' | 'desc' }
export interface HistorySearchParams { q: string; limit?: number; order?: string; message_types?: string[]; since?: number; until?: number }
export interface HistoryHit { seq: number; kind: string; created_at: number; snippet: string }
export interface MessageBlock { type: string; blob_id: string; filename?: string | null; byte_count?: number | null; placeholder?: string }
// An attachment reference carried by a queued delivery (blob ids are session-qualified).
export interface QueuedAttachment { kind: string; blob_id: string; filename?: string | null; byte_count?: number; placeholder?: string }
export interface QueuedDelivery { id: string; state: 'queued'; text: string; attachments: QueuedAttachment[] }
export interface ShellSettings { program: string; args: string[] | null }
export interface BlobInfo { id: string; mime_type: string; byte_count: number }
export interface UploadedBlob extends BlobInfo { sha256: string }
export interface EffectiveConfig { defaults: { provider: string; model: string; reasoning?: { effort?: string }; instructions: string; cwd: string; shell: boolean } }
export interface DefaultModel { provider: string; model: string; reasoning_effort?: string }
export interface DirectoryListing { path: string; parent: string | null; directories: string[] }
export interface UsageTotals {
  usage_records: number;
  committed_responses: number;
  tokens: { input_tokens: number; output_tokens: number; total_tokens: number; reasoning_tokens: number };
  cache: { request_hit_ratio: number | null; read_input_tokens: number; write_input_tokens: number };
}
export interface UsageSnapshot {
  statistics: {
    model_attempts: number;
    attempts_with_usage: number;
    attempts_without_usage: number;
    totals: UsageTotals;
    by_provider_model: { provider: string | null; model: string | null; totals: UsageTotals }[];
  };
}
export interface StatusSnapshot {
  counts: { sessions: number; runs: number };
  queue: { active_sessions: number; ready_sessions: number; pending_items: number; compacting_sessions: number };
  uptime_ms: number;
}
export interface StorageSnapshot {
  bytes: { session_data: number; blobs: number; executions: number; service_data: number; total: number };
  counts: { executions: number; blobs: number; image_jobs: number; context_generations: number };
}
// Just what requireAvailableModel reads from a provider's settings.
export interface ModelCatalogSource { id: string; model_list?: unknown; models?: Record<string, any> | null }

const path = (id: string) => `/sessions/${encodeURIComponent(id)}`;
const phase: Record<string, string> = { running: 'running', queued: 'Ready', compacting: 'Compacting', idle: 'Idle' };
export const sessionGet = async (id: string, opts?: EndpointOptions) => sessionView(await get(path(id), opts));
export async function sessionsList(params: SessionsListParams = {}): Promise<SessionsPage> {
  const page = await get('/sessions', { query: { start: params.cursor ?? 0, limit: params.limit, order: params.order,
    query: params.query, phase: phase[params.phase!], tag: params.tag } });
  return { items: page.items.map(sessionView), next_cursor: page.next, has_more: page.next != null };
}
export async function requireAvailableModel(provider: ModelCatalogSource | null | undefined, id: string): Promise<void> {
  if (!provider) throw new Error('Choose an existing provider before selecting a model.');
  const configured = provider.models?.[id];
  if (configured?.custom_model_id) return;
  if (provider.model_list) {
    try {
      let cursor: string | null | undefined;
      const seen = new Set();
      do {
        const page = await get(`/providers/${encodeURIComponent(provider.id)}/models`, { query: { cursor } });
        if (page.items?.some((model: { id: string }) => model.id === id)) return;
        cursor = page.next_cursor;
        if (cursor && seen.has(cursor)) throw new Error(`Model catalog repeated a cursor: ${provider.id}`);
        if (cursor) seen.add(cursor);
      } while (cursor);
    } catch (error) {
      // Keep already-configured models usable while an upstream catalog is unavailable.
      if (configured && error && typeof error === 'object' && 'status' in error) return;
      throw error;
    }
  } else if (configured) return;
  throw new Error(`Model ID "${id}" is unavailable for provider "${provider.id}". Use the exact upstream ID.`);
}
export async function sessionCreate(body: CreateSessionBody) {
  const [{ defaults, session_config }, providers] = await Promise.all([get('/defaults'), get('/providers')]);
  const provider = providers.items.find((p: { id: string }) => p.id === body.provider);
  await requireAvailableModel(provider, body.model);
  const model = provider?.models?.[body.model] ?? {};
  const effort = body.reasoning_effort ?? model.default_reasoning_effort ?? session_config.reasoning?.effort;
  const instructions = body.agent_custom ?? defaults.instructions;
  const config = { ...session_config, model: body.model, max_output_tokens: model.max_output_tokens ?? provider?.max_output_tokens ?? session_config.max_output_tokens, reasoning: effort ? { ...session_config.reasoning, effort } : session_config.reasoning };
  const value = await post('/sessions', { provider: body.provider, name: body.name ?? '', cwd: body.cwd ?? defaults.cwd,
    shell: defaults.shell, config, metadata: { agent_custom: instructions },
    initial_messages: instructions ? [{ System: { content: [{ Text: { text: instructions } }] } }] : [] });
  return sessionView(value);
}
const revisionOptions = (revision: number | null | undefined, opts?: EndpointOptions) => ({ ...opts, headers: { ...opts?.headers, ...(revision != null ? { 'if-match': String(revision) } : {}) } });
export const sessionRename = async (id: string, name: string) => sessionView(await patch(path(id), { name }));
export const sessionUpdateMeta = async (id: string, metadata: unknown, revision?: number | null, opts?: EndpointOptions) => sessionView(await patch(path(id), { metadata }, revisionOptions(revision, opts)));
export const sessionDelete = (id: string, opts?: EndpointOptions) => del(path(id), opts);
export async function sessionUpdateModel(id: string, body: ModelChange, revision?: number | null, opts?: EndpointOptions) {
  const [current, providers] = await Promise.all([sessionGet(id, opts), get('/providers', opts)]);
  const provider = providers.items.find((p: { id: string }) => p.id === (body.provider ?? current.provider));
  if ((body.model ?? current.model) !== current.model || (body.provider ?? current.provider) !== current.provider) {
    await requireAvailableModel(provider, body.model ?? current.model);
  }
  const model = provider?.models?.[body.model ?? current.model];
  // A target with no known levels resolves to `max`, the same default the reasoning picker
  // shows for it (see reasoningLabels); known levels keep the model's own default (null).
  const knownLevels = Object.keys(model?.reasoning_efforts ?? provider?.reasoning_efforts ?? {}).filter(level => level !== 'none' && level !== 'auto');
  const effort = body.reasoning_effort ?? (model?.supports_reasoning === false || knownLevels.length ? null : 'max');
  const config = { ...current.config, model: body.model ?? current.model, max_output_tokens: model?.max_output_tokens ?? provider?.max_output_tokens ?? null, reasoning: effort ? { ...current.config.reasoning, effort } : null };
  return sessionView(await patch(path(id), { provider: body.provider ?? current.provider, config }, revisionOptions(revision, opts)));
}
export async function historyPage(id: string, params: HistoryQuery, opts?: EndpointOptions): Promise<{ items: EntryView[]; has_more: boolean; next_cursor: any }> {
  const page = await get(`${path(id)}/history`, { query: { ...params, include_outcomes: true }, ...opts });
  return { items: page.items.map((item: unknown) => entryView(item, id)), has_more: page.next != null, next_cursor: page.next };
}
export async function historySearch(id: string, params: HistorySearchParams, opts?: EndpointOptions): Promise<{ items: HistoryHit[]; has_more: boolean; next_cursor: null }> {
  const result = await post(`${path(id)}/history/search`, { query: { text: params.q, mode: 'substring', limit: params.limit ?? 50 },
    filter: { kind: 'message', ...(params.message_types ? {message_types:params.message_types} : {}), since:params.since, until:params.until } }, opts);
  return { items: result.items.map((hit: any) => ({ seq: hit.record.sequence, kind: hit.message_type, created_at:hit.record.recorded_at, snippet:hit.snippet })), has_more: result.has_more, next_cursor:null };
}
// Queues the input; `entry` is its position in the session's message list.
export const messageSend = async (id: string, body: { content?: string; blocks?: readonly MessageBlock[] }, opts?: EndpointOptions): Promise<{ id: string; entry: number }> => {
  const result = await post(`${path(id)}/input`, { text: body.content ?? '', attachments: (body.blocks ?? []).map(b => ({ id:b.blob_id, kind:b.type, name:b.filename ?? null, ...(b.byte_count != null ? {byte_count:b.byte_count} : {}), ...(b.placeholder ? {placeholder:b.placeholder} : {}) })) }, opts);
  return { id:String(result.entry), entry:result.entry };
};
export const sessionInterrupt = (id: string) => post(`${path(id)}/interrupt`);
// Replaces the whole session config; the server refuses non-model changes while it runs.
export const sessionUpdateConfig = async (id: string, config: unknown, revision?: number | null, opts?: EndpointOptions) => sessionView(await patch(path(id), { config }, revisionOptions(revision, opts)));
// `{program, args}` for the session's own shell, or null to follow the configured one.
export const sessionSetShell = async (id: string, settings: ShellSettings | null) => sessionView(await put(`${path(id)}/shell`, settings));
export const sessionCompact = (id: string) => post(`${path(id)}/compact`);
export const sessionClearContext = (id: string) => post(`${path(id)}/context/clear`);
export const sessionFork = async (id: string) => sessionView(await post(`${path(id)}/fork`));
export async function deliveriesList(id: string, params?: { limit?: number }, opts?: EndpointOptions): Promise<{ items: QueuedDelivery[]; has_more: boolean }> {
  const snap = await sessionGet(id, opts);
  const page = await get(`${path(id)}/queue`, {query:{start:snap.status.queue_head,limit:params?.limit ?? 50},...opts});
  const items: (QueuedDelivery | null)[] = await Promise.all(page.items.map(async (entry: number): Promise<QueuedDelivery | null> => {
    const values = await get(`${path(id)}/entries`, { query:{start:entry,limit:1},...opts });
    const message = values.items[0].message.User;
    if (!message || message.metadata?.source) return null;
    return { id:String(entry),state:'queued',text:message?.metadata?.input_text ?? message?.content.filter((b: any)=>b.Text).map((b: any)=>b.Text.text).join('\n') ?? '',attachments:(message?.metadata?.attachments??[]).map((a: any)=>({kind:a.kind,blob_id:`${id}/${a.id}`,filename:a.name,byte_count:a.byte_count,placeholder:a.placeholder})) };
  }));
  return {items:items.filter(item => item !== null),has_more:page.next!=null};
}
export const moveQueuedInput = (id: string, entry: string, before: string | number | null) => patch(`${path(id)}/queue/${entry}`, {before:before == null ? null : Number(before)});
export const cancelQueuedInput = (id: string, entry: string) => del(`${path(id)}/queue/${entry}`);
export const providerConfigs = async (opts?: EndpointOptions): Promise<{ providers: ProviderView[] }> => ({providers:(await get('/providers',opts)).items.map(providerView)});
export const providerModels = async (id: string,opts?: EndpointOptions) => {const result=await get(`/providers/${encodeURIComponent(id)}/models`,opts);return {...result,models:result.items.map((m: any)=>({...m,display_name:m.name,allowed_for_provider:true}))};};
export const configEffective = (): Promise<EffectiveConfig> => get('/defaults');
export async function rememberDefaultModel(value: DefaultModel): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await get('/config');
    if (snapshot.config.defaults.provider===value.provider && snapshot.config.defaults.model===value.model && snapshot.config.defaults.reasoning?.effort===value.reasoning_effort) return;
    snapshot.config.defaults.provider=value.provider; snapshot.config.defaults.model=value.model;
    snapshot.config.defaults.reasoning={...snapshot.config.defaults.reasoning,effort:value.reasoning_effort??null};
    try { await put('/config',snapshot); return; }
    catch (error: any) { if (error?.status !== 409 || attempt === 2) throw error; }
  }
}
export const uploadSessionBlob = async (sid: string, bytes: ArrayBuffer | Uint8Array, opts?: EndpointOptions): Promise<UploadedBlob> => {
  const blob=await api('POST',`${path(sid)}/blobs`,{body:bytes,raw:true,headers:{'content-type':'application/octet-stream'},...opts});
  return {...blob,sha256:blob.id};
};
export const uploadSessionImage = uploadSessionBlob;
export const blobMetadata = (reference: string): Promise<BlobInfo> => { const [sid,hash]=reference.split('/'); return get(`${path(sid)}/blobs/${hash}/meta`); };
export const blobUrl = (reference: string) => {const [sid,hash]=reference.split('/');return `${getBaseUrl()}${path(sid)}/blobs/${hash}`;};
export async function sessionCapabilities(id: string, opts?: EndpointOptions): Promise<{ input_modalities: string[] | null }> { const session=await sessionGet(id,opts); const provider=await get('/providers/'+encodeURIComponent(session.provider),opts); return {input_modalities:provider.models?.[session.model]?.input_modalities??null}; }
export const daemonVersion = (opts?: EndpointOptions): Promise<{ name: string; version: string }> => get('/version',opts);
export const daemonStatus = (opts?: EndpointOptions): Promise<StatusSnapshot> => get('/status',opts);
export const usageTotals = (opts?: EndpointOptions): Promise<UsageSnapshot> => get('/usage',opts);
export const sessionUsage = (id: string) => get(`${path(id)}/usage`);
export const storageStatus = (opts?: EndpointOptions): Promise<StorageSnapshot> => get('/storage',opts);
export const usageSeries = (id: string | undefined,params: SeriesQuery,opts?: EndpointOptions): Promise<UsageSeriesResponse> => get(id?`${path(id)}/usage/series`:'/usage/series',{query:params,...opts});
export const usageDaily = (id: string | undefined,params: DailyQuery,opts?: EndpointOptions): Promise<UsageDailyResponse> => get(id?`${path(id)}/usage/daily`:'/usage/daily',{query:params,...opts});

export const directoriesList = (path: string): Promise<DirectoryListing> => get("/directories", { query: { path } });
