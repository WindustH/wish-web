import { get, post, patch, put, del, api, getBaseUrl } from './client.js';
import { sessionView, entryView, providerView } from './projections.js';
const path = id => `/sessions/${encodeURIComponent(id)}`;
const phase = { running: 'running', queued: 'Ready', compacting: 'Compacting', idle: 'Idle' };
export const sessionGet = async (id, opts) => sessionView(await get(path(id), opts));
export async function sessionsList(params = {}) {
  const page = await get('/sessions', { query: { start: params.cursor ?? 0, limit: params.limit, order: params.order,
    query: params.query, phase: phase[params.phase], tag: params.tag } });
  return { items: page.items.map(sessionView), next_cursor: page.next, has_more: page.next != null };
}
export async function sessionCreate(body) {
  const [{ defaults, session_config }, providers] = await Promise.all([get('/defaults'), get('/providers')]);
  const provider = providers.items.find(p => p.id === body.provider);
  const model = provider?.models?.[body.model] ?? {};
  const effort = body.reasoning_effort ?? model.default_reasoning_effort ?? session_config.reasoning?.effort;
  const instructions = body.agent_custom ?? defaults.instructions;
  const config = { ...session_config, model: body.model, max_output_tokens: model.max_output_tokens ?? provider?.max_output_tokens ?? session_config.max_output_tokens, reasoning: effort ? { ...session_config.reasoning, effort } : session_config.reasoning };
  const value = await post('/sessions', { provider: body.provider, name: body.name ?? '', cwd: defaults.cwd,
    shell: defaults.shell, config, metadata: { agent_custom: instructions },
    initial_messages: instructions ? [{ System: { content: [{ Text: { text: instructions } }] } }] : [] });
  return sessionView(value);
}
const revisionOptions = (revision, opts) => ({ ...opts, headers: { ...opts?.headers, ...(revision != null ? { 'if-match': String(revision) } : {}) } });
export const sessionRename = async (id, name) => sessionView(await patch(path(id), { name }));
export const sessionUpdateMeta = async (id, metadata, revision, opts) => sessionView(await patch(path(id), { metadata }, revisionOptions(revision, opts)));
export const sessionDelete = (id, opts) => del(path(id), opts);
export async function sessionUpdateModel(id, body, revision, opts) {
  const [current, providers] = await Promise.all([sessionGet(id, opts), get('/providers', opts)]);
  const provider = providers.items.find(p => p.id === (body.provider ?? current.provider));
  const model = provider?.models?.[body.model ?? current.model];
  const config = { ...current.config, model: body.model ?? current.model, max_output_tokens: model?.max_output_tokens ?? provider?.max_output_tokens ?? null, reasoning: body.reasoning_effort ? { ...current.config.reasoning, effort: body.reasoning_effort } : null };
  return sessionView(await patch(path(id), { provider: body.provider ?? current.provider, config }, revisionOptions(revision, opts)));
}
export async function historyPage(id, params, opts) {
  const page = await get(`${path(id)}/history`, { query: { ...params, include_outcomes: true }, ...opts });
  return { items: page.items.map(item => entryView(item, id)), has_more: page.next != null, next_cursor: page.next };
}
export async function historySearch(id, params, opts) {
  const result = await post(`${path(id)}/history/search`, { query: { text: params.q, mode: 'substring', limit: params.limit ?? 50 },
    filter: { kind: 'message', ...(params.message_types ? {message_types:params.message_types} : {}), since:params.since, until:params.until } }, opts);
  return { items: result.items.map(hit => ({ seq: hit.record.sequence, kind: hit.message_type, created_at:hit.record.recorded_at, snippet:hit.snippet })), has_more: result.has_more, next_cursor:null };
}
export const messageSend = async (id, body, opts) => {
  const result = await post(`${path(id)}/input`, { text: body.content ?? '', attachments: (body.blocks ?? []).map(b => ({ id:b.blob_id, kind:b.type, name:b.filename ?? null })) }, opts);
  return { id:String(result.entry), entry:result.entry };
};
export const sessionInterrupt = id => post(`${path(id)}/interrupt`);
export const sessionCompact = id => post(`${path(id)}/compact`);
export const sessionClearContext = id => post(`${path(id)}/context/clear`);
export const sessionFork = async id => sessionView(await post(`${path(id)}/fork`));
export async function deliveriesList(id, params, opts) {
  const snap = await sessionGet(id, opts);
  const page = await get(`${path(id)}/queue`, {query:{start:snap.status.queue_head,limit:params?.limit ?? 50},...opts});
  const items = await Promise.all(page.items.map(async entry => {
    const values = await get(`${path(id)}/entries`, { query:{start:entry,limit:1},...opts });
    const message = values.items[0].message.User;
    if (!message || message.metadata?.source) return null;
    return { id:String(entry),state:'queued',text:message?.metadata?.input_text ?? message?.content.filter(b=>b.Text).map(b=>b.Text.text).join('\n') ?? '',attachments:(message?.metadata?.attachments??[]).map(a=>({kind:a.kind,blob_id:`${id}/${a.id}`,filename:a.name})) };
  }));
  return {items:items.filter(Boolean),has_more:page.next!=null};
}
export const moveQueuedInput = (id, entry, before) => patch(`${path(id)}/queue/${entry}`, {before:before == null ? null : Number(before)});
export const cancelQueuedInput = (id, entry) => del(`${path(id)}/queue/${entry}`);
export const providerConfigs = async opts => ({providers:(await get('/providers',opts)).items.map(providerView)});
export const providerModels = async (id,opts) => {const result=await get(`/providers/${encodeURIComponent(id)}/models`,opts);return {...result,models:result.items.map(m=>({...m,display_name:m.name,allowed_for_provider:true}))};};
export const configEffective = () => get('/defaults');
export async function rememberDefaultModel(value) {
  const snapshot = await get('/config');
  if (snapshot.config.defaults.provider===value.provider && snapshot.config.defaults.model===value.model && snapshot.config.defaults.reasoning?.effort===value.reasoning_effort) return;
  snapshot.config.defaults.provider=value.provider; snapshot.config.defaults.model=value.model;
  snapshot.config.defaults.reasoning={...snapshot.config.defaults.reasoning,effort:value.reasoning_effort??null};
  await put('/config',snapshot);
}
export const uploadSessionBlob = async (sid, bytes, opts) => {
  const blob=await api('POST',`${path(sid)}/blobs`,{body:bytes,raw:true,headers:{'content-type':'application/octet-stream'},...opts});
  return {...blob,sha256:blob.id};
};
export const uploadSessionImage = uploadSessionBlob;
export const blobUrl = reference => {const [sid,hash]=reference.split('/');return `${getBaseUrl()}${path(sid)}/blobs/${hash}`;};
export async function sessionCapabilities(id, opts) { const session=await sessionGet(id,opts); const provider=await get('/providers/'+encodeURIComponent(session.provider),opts); return {input_modalities:provider.models?.[session.model]?.input_modalities??null}; }
export const daemonVersion = opts => get('/version',opts);
export const daemonStatus = opts => get('/status',opts);
export const usageTotals = opts => get('/usage',opts);
export const sessionUsage = id => get(`${path(id)}/usage`);
export const storageStatus = opts => get('/storage',opts);
export const usageSeries = (id,params,opts) => get(id?`${path(id)}/usage/series`:'/usage/series',{query:params,...opts});
export const usageDaily = (id,params,opts) => get(id?`${path(id)}/usage/daily`:'/usage/daily',{query:params,...opts});
