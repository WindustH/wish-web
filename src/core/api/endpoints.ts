// One function per server endpoint, grouped by what they act on. Most are thin; the few that
// combine requests say so. The shapes they take and return are in types.ts.
import { get, post, patch, put, del, api, getBaseUrl } from './client.ts';
import { sessionView, entryView, providerView, type EntryView, type ProviderView, type ToolSwitches } from './projections.ts';
import type { SeriesQuery, DailyQuery, UsageSeriesResponse, UsageDailyResponse } from '../usage/types.ts';
import type { ConfigCatalog, ProviderConfig } from '../provider-presets.ts';
import type {
  BlobInfo, ChatgptLogin, ConfigSnapshot, CreateSessionBody, DefaultModel, DirectoryListing, EffectiveConfig,
  EndpointOptions, HistoryHit, HistoryQuery, HistorySearchParams, McpServerStatus, McpTool, MessageBlock,
  ModelCatalogSource, ModelChange, PruneResult, QuestionAnswer, QueuedDelivery, SearchHit, SearchPreset,
  SearchProviderStatus, SessionBytes, SessionStorage, SessionsListParams, SessionsPage, ShellCatalog, ShellSettings,
  StorageSnapshot, UploadedBlob, UsageSnapshot,
} from './types.ts';
export type * from './types.ts';

const path = (id: string) => `/sessions/${encodeURIComponent(id)}`;
// A change that must apply to the revision the caller read carries it as If-Match.
const revisionOptions = (revision: number | null | undefined, opts?: EndpointOptions) =>
  ({ ...opts, headers: { ...opts?.headers, ...(revision != null ? { 'if-match': String(revision) } : {}) } });

// Sessions.
export const sessionGet = async (id: string, opts?: EndpointOptions) => sessionView(await get(path(id), opts));
export async function sessionsList(params: SessionsListParams = {}, opts?: EndpointOptions): Promise<SessionsPage> {
  const page = await get('/sessions', { query: { start: params.cursor ?? 0, limit: params.limit, order: params.order,
    query: params.query, tag: params.tag }, ...opts });
  return { items: page.items.map(sessionView), next_cursor: page.next, has_more: page.next != null };
}
// Combines requests: the defaults and the provider decide the new session's configuration.
export async function sessionCreate(body: CreateSessionBody) {
  const [{ defaults, session_config }, providers] = await Promise.all([get('/defaults'), get('/providers')]);
  const provider = providers.items.find((p: { id: string }) => p.id === body.provider);
  await requireAvailableModel(provider, body.model);
  const model = provider?.models?.[body.model] ?? {};
  const effort = body.reasoning_effort ?? model.default_reasoning_effort ?? session_config.reasoning?.effort;
  const instructions = body.agent_custom ?? defaults.instructions;
  const config = { ...session_config, model: body.model, max_output_tokens: model.max_output_tokens ?? provider?.max_output_tokens ?? session_config.max_output_tokens, reasoning: effort ? { ...session_config.reasoning, effort } : session_config.reasoning };
  const value = await post('/sessions', { provider: body.provider, name: body.name ?? '', cwd: body.cwd ?? defaults.cwd,
    tools: defaults.tools, config, metadata: { agent_custom: instructions },
    initial_messages: instructions ? [{ System: { content: [{ Text: { text: instructions } }] } }] : [] });
  return sessionView(value);
}
export const sessionRename = async (id: string, name: string) => sessionView(await patch(path(id), { name }));
export const sessionUpdateMeta = async (id: string, metadata: unknown, revision?: number | null, opts?: EndpointOptions) =>
  sessionView(await patch(path(id), { metadata }, revisionOptions(revision, opts)));
export const sessionDelete = (id: string, opts?: EndpointOptions) => del(path(id), opts);
// Combines requests: the target provider's settings decide the effort and output limit.
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
// Replaces the whole session config; the server refuses non-model changes while it runs.
export const sessionUpdateConfig = async (id: string, config: unknown, revision?: number | null, opts?: EndpointOptions) =>
  sessionView(await patch(path(id), { config }, revisionOptions(revision, opts)));
// Turns the session's optional tools on or off; the server refuses while it runs.
export const sessionSetTools = async (id: string, changes: Partial<ToolSwitches>) => sessionView(await put(`${path(id)}/tools`, changes));
// `{program, args}` for the session's own shell, or null to follow the configured one.
export const sessionSetShell = async (id: string, settings: ShellSettings | null) => sessionView(await put(`${path(id)}/shell`, settings));
export const sessionInterrupt = (id: string) => post(`${path(id)}/interrupt`);
export const sessionCompact = (id: string) => post(`${path(id)}/compact`);
export const sessionClearContext = (id: string) => post(`${path(id)}/context/clear`);
// Combines requests: the session's model is read off its provider.
export async function sessionCapabilities(id: string, opts?: EndpointOptions): Promise<{ input_modalities: string[] | null }> {
  const session = await sessionGet(id, opts);
  const provider = await get(`/providers/${encodeURIComponent(session.provider)}`, opts);
  return { input_modalities: provider.models?.[session.model]?.input_modalities ?? null };
}

// History.
export async function historyPage(id: string, params: HistoryQuery, opts?: EndpointOptions): Promise<{ items: EntryView[]; has_more: boolean; next_cursor: any }> {
  const page = await get(`${path(id)}/history`, { query: { ...params, include_outcomes: true }, ...opts });
  return { items: page.items.map((item: unknown) => entryView(item, id)), has_more: page.next != null, next_cursor: page.next };
}
export async function historySearch(id: string, params: HistorySearchParams, opts?: EndpointOptions): Promise<{ items: HistoryHit[]; has_more: boolean; next_cursor: null }> {
  const result = await post(`${path(id)}/history/search`, { query: { text: params.q, mode: 'substring', limit: params.limit ?? 50 },
    filter: { kind: 'message', ...(params.message_types ? { message_types: params.message_types } : {}), since: params.since, until: params.until } }, opts);
  return { items: result.items.map((hit: any) => ({ seq: hit.record.sequence, kind: hit.message_type, created_at: hit.record.recorded_at, snippet: hit.snippet })), has_more: result.has_more, next_cursor: null };
}

// Input and the queue.
// Queues the input; `entry` is its position in the session's message list.
export const messageSend = async (id: string, body: { content?: string; blocks?: readonly MessageBlock[] }, opts?: EndpointOptions): Promise<{ id: string; entry: number }> => {
  const attachments = (body.blocks ?? []).map(b => ({ id: b.blob_id, kind: b.type, name: b.filename ?? null,
    ...(b.byte_count != null ? { byte_count: b.byte_count } : {}), ...(b.placeholder ? { placeholder: b.placeholder } : {}) }));
  const result = await post(`${path(id)}/input`, { text: body.content ?? '', attachments }, opts);
  return { id: String(result.entry), entry: result.entry };
};
// Combines requests: the queue holds entry positions, and each input is read from its entry.
export async function deliveriesList(id: string, params?: { limit?: number }, opts?: EndpointOptions): Promise<{ items: QueuedDelivery[]; has_more: boolean }> {
  const snap = await sessionGet(id, opts);
  const page = await get(`${path(id)}/queue`, { query: { start: snap.status.queue_head, limit: params?.limit ?? 50 }, ...opts });
  const items: (QueuedDelivery | null)[] = await Promise.all(page.items.map(async (entry: number): Promise<QueuedDelivery | null> => {
    const values = await get(`${path(id)}/entries`, { query: { start: entry, limit: 1 }, ...opts });
    const message = values.items[0].message.User;
    if (!message || message.metadata?.source) return null;
    const text = message.metadata?.input_text ?? message.content.filter((b: any) => b.Text).map((b: any) => b.Text.text).join('\n') ?? '';
    const attachments = (message.metadata?.attachments ?? []).map((a: any) => ({ kind: a.kind, blob_id: `${id}/${a.id}`, filename: a.name, byte_count: a.byte_count, placeholder: a.placeholder }));
    return { id: String(entry), state: 'queued', text, attachments };
  }));
  return { items: items.filter(item => item !== null), has_more: page.next != null };
}
export const moveQueuedInput = (id: string, entry: string, before: string | number | null) =>
  patch(`${path(id)}/queue/${entry}`, { before: before == null ? null : Number(before) });
export const cancelQueuedInput = (id: string, entry: string) => del(`${path(id)}/queue/${entry}`);
// Answers an `ask_user` form, or skips it. `delivered` says whether the waiting call took it
// (`now`) or, after a timeout, it went to the session as a message (`later`).
export const answerQuestion = (id: string, body: { call_id: string; answers?: QuestionAnswer[]; skip?: boolean }): Promise<{ delivered: 'now' | 'later' | 'dropped' }> =>
  post(`${path(id)}/answer`, body);

// Blobs: a session's uploads, named `<session>/<sha256>` outside the session.
const blobPath = (reference: string) => { const [sid, hash] = reference.split('/'); return `${path(sid!)}/blobs/${hash}`; };
export const uploadSessionBlob = async (sid: string, bytes: ArrayBuffer | Uint8Array, opts?: EndpointOptions): Promise<UploadedBlob> => {
  const blob = await api('POST', `${path(sid)}/blobs`, { body: bytes, raw: true, headers: { 'content-type': 'application/octet-stream' }, ...opts });
  return { ...blob, sha256: blob.id };
};
export const blobMetadata = (reference: string): Promise<BlobInfo> => get(`${blobPath(reference)}/meta`);
export const blobUrl = (reference: string) => `${getBaseUrl()}${blobPath(reference)}`;

// Providers.
export const providerConfigs = async (opts?: EndpointOptions): Promise<{ providers: ProviderView[] }> =>
  ({ providers: (await get('/providers', opts)).items.map(providerView) });
const catalogPage = (result: any) => ({ ...result, models: result.items.map((m: any) => ({ ...m, display_name: m.name, allowed_for_provider: true })) });
export const providerModels = async (id: string, opts?: EndpointOptions) =>
  catalogPage(await get(`/providers/${encodeURIComponent(id)}/models`, opts));
/** A catalog page of a provider as a form holds it, saved or not; secrets it shows redacted are the
 *  saved provider's of that id. */
export const providerDraftModels = async (id: string, provider: ProviderConfig, cursor?: string, opts?: EndpointOptions) =>
  catalogPage(await post('/provider-draft/models', { id, provider, cursor }, opts));
/** Every page of a model catalog, in order. A cursor the catalog repeats is an error, so a malformed
 *  one cannot keep a caller in an endless loop. */
async function* catalogPages(id: string, read: (cursor?: string) => Promise<any>, signal?: AbortSignal) {
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    signal?.throwIfAborted();
    const page = await read(cursor);
    yield page;
    cursor = page.next_cursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error(`Model catalog repeated a cursor: ${id}`);
      cursors.add(cursor);
    }
  } while (cursor);
}
export const providerCatalogPages = (id: string, opts?: EndpointOptions) =>
  catalogPages(id, cursor => providerModels(id, { ...opts, query: { cursor } }), opts?.signal);
export const providerDraftCatalogPages = (id: string, provider: ProviderConfig, opts?: EndpointOptions) =>
  catalogPages(id, cursor => providerDraftModels(id, provider, cursor, opts), opts?.signal);
/** Refuses a model the provider does not offer: not configured, and not in its catalog when it has one. */
export async function requireAvailableModel(provider: ModelCatalogSource | null | undefined, id: string): Promise<void> {
  if (!provider) throw new Error('Choose an existing provider before selecting a model.');
  const configured = provider.models?.[id];
  if (configured?.custom_model_id) return;
  if (provider.model_list) {
    try {
      for await (const page of providerCatalogPages(provider.id)) {
        if (page.items?.some((model: { id: string }) => model.id === id)) return;
      }
    } catch (error) {
      // Keep already-configured models usable while an upstream catalog is unavailable.
      if (configured && error && typeof error === 'object' && 'status' in error) return;
      throw error;
    }
  } else if (configured) return;
  throw new Error(`Model ID "${id}" is unavailable for provider "${provider.id}". Use the exact upstream ID.`);
}
// The provider's account reading (balance, plan windows), in the server's AccountState shape.
export const providerAccount = (id: string, opts?: EndpointOptions): Promise<unknown> => get(`/providers/${encodeURIComponent(id)}/account`, opts);
const chatgptLogin = (provider: string) => `/providers/${encodeURIComponent(provider)}/chatgpt-login`;
export const chatgptLoginStart = (provider: string): Promise<{ authorization_url: string }> => post(chatgptLogin(provider), {});
export const chatgptLoginStatus = (provider: string): Promise<ChatgptLogin> => get(chatgptLogin(provider));
export const chatgptLoginComplete = (provider: string, callbackUrl: string) => post(`${chatgptLogin(provider)}/complete`, { callback_url: callbackUrl });

// Configuration.
export const configEffective = (opts?: EndpointOptions): Promise<EffectiveConfig> => get('/defaults', opts);
export const configSnapshot = (opts?: EndpointOptions): Promise<ConfigSnapshot> => get('/config', opts);
export const configSave = (snapshot: ConfigSnapshot, opts?: EndpointOptions): Promise<ConfigSnapshot> => put('/config', snapshot, opts);
export const providerPresets = (opts?: EndpointOptions): Promise<ConfigCatalog> => get('/provider-presets', opts);
export const proxyEnvironment = (opts?: EndpointOptions): Promise<{ variables: { name: string; value: string; redacted: boolean }[] }> => get('/proxy-environment', opts);
export const shellCatalog = (opts?: EndpointOptions): Promise<ShellCatalog> => get('/shells', opts);
export const directoriesList = (path: string): Promise<DirectoryListing> => get('/directories', { query: { path } });
// Combines requests: saves the default model into the configuration, reading it again when a
// concurrent save moved its revision.
export async function rememberDefaultModel(value: DefaultModel): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await configSnapshot();
    const defaults = snapshot.config.defaults;
    if (defaults.provider === value.provider && defaults.model === value.model && defaults.reasoning?.effort === value.reasoning_effort) return;
    defaults.provider = value.provider;
    defaults.model = value.model;
    defaults.reasoning = { ...defaults.reasoning, effort: value.reasoning_effort ?? null };
    try { await configSave(snapshot); return; }
    catch (error: any) { if (error?.status !== 409 || attempt === 2) throw error; }
  }
}

// MCP servers.
export const mcpServers = (): Promise<McpServerStatus[]> => get('/mcp/servers');
// Starts the saved server on a connection of its own and lists its tools.
export const mcpCheck = (id: string): Promise<{ server: McpServerStatus['server']; tools: McpTool[]; stderr: string }> =>
  post(`/mcp/servers/${encodeURIComponent(id)}/check`, {}, { timeoutMs: 150_000 });

// Web search.
export const searchPresets = (): Promise<{ presets: SearchPreset[] }> => get('/search-presets');
export const searchProviders = (): Promise<{ providers: SearchProviderStatus[]; available: boolean }> => get('/search/providers');
// One test search on the saved provider.
export const searchCheck = (id: string): Promise<{ results: SearchHit[]; warnings: string[]; duration_ms: number }> =>
  post(`/search/providers/${encodeURIComponent(id)}/check`, {}, { timeoutMs: 90_000 });

// Usage and storage.
export const usageTotals = (opts?: EndpointOptions): Promise<UsageSnapshot> => get('/usage', opts);
export const sessionUsage = (id: string) => get(`${path(id)}/usage`);
export const usageSeries = (id: string | undefined, params: SeriesQuery, opts?: EndpointOptions): Promise<UsageSeriesResponse> =>
  get(id ? `${path(id)}/usage/series` : '/usage/series', { query: params, ...opts });
export const usageDaily = (id: string | undefined, params: DailyQuery, opts?: EndpointOptions): Promise<UsageDailyResponse> =>
  get(id ? `${path(id)}/usage/daily` : '/usage/daily', { query: params, ...opts });
export const storageStatus = (opts?: EndpointOptions): Promise<StorageSnapshot> => get('/storage', opts);
export const sessionsStorage = (opts?: EndpointOptions): Promise<{ sessions: SessionStorage[]; bytes: SessionBytes }> => get('/storage/sessions', opts);
// `sessions` absent prunes every session; `before` (Unix ms) keeps what was recorded since.
export const storagePrune = (body: { sessions?: string[]; before?: number | null; dry_run?: boolean }, opts?: EndpointOptions): Promise<PruneResult> =>
  post('/storage/prune', body, { timeoutMs: 120_000, ...opts });
