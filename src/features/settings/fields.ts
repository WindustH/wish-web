import { atPath, isObject } from '../../core/config-editor';
import type { ConfigCatalog, ConfigObject, Json } from '../../core/config-editor';
import { helpFor } from './field-help';
import { i18n } from '../../core/i18n/index.js';

export const tr = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;

// Presentation metadata for the current backend schema, not another validator.
// Numeric/relational constraints remain authoritative on the daemon.
const labels: Record<string, string> = {
  data_dir: '数据目录', wishd: 'Wish 会话服务', providerd: '模型提供服务',
  agent: '运行与工具调用', retry: '重试策略', queue: '消息队列', stateless: '独立上下文查询',
  compaction: '上下文压缩', shell: 'Shell 执行', images: '图片上传', attachments: '文件附件', image_jobs: '图片生成',
  context_json: '上下文导入与导出', context_measurement: '上下文用量测量', context_read: '上下文读取',
  account_observation: '账户用量查询', storage: '存储', leases: '会话写入租约', events: '事件推送',
  streaming: '流式回复', status: '状态查询', diagnostics: '诊断信息', idempotency: '请求去重', logging: '日志',
  listen: '监听地址', host: '主机地址', port: '端口', auth: '身份验证', mode: '工作模式', token: '访问令牌',
  allow_insecure_remote: '允许未验证的远程连接', provider_client: '模型服务连接',
  base_url: '服务地址', bearer_token: '服务访问令牌', proxy_policy: '代理策略', http: 'HTTP 请求',
  connect_timeout_ms: '连接超时', total_timeout_ms: '请求总超时', stream_read_timeout_ms: '流式读取超时',
  default_model: '新会话的默认模型', provider: '提供商', model: '模型', reasoning_effort: '推理强度',
  max_json_body_bytes: '请求内容大小上限', max_assistant_message_bytes: '助手消息大小上限',
  unknown_tool_is_fatal: '遇到未知工具时停止运行', tool_execution: '工具执行方式',
  max_attempts: '最多尝试次数', initial_delay_ms: '首次重试等待', max_delay_ms: '重试等待上限',
  multiplier: '等待时间增长倍数', jitter_ratio: '等待时间随机浮动比例', circuit_breaker: '故障暂停策略',
  enabled: '启用', minimum_samples: '最少样本数量', failure_ratio: '触发暂停的失败比例',
  sample_window_ms: '样本统计时段', open_ms: '暂停时间', half_open_max_probes: '恢复探测次数', max_open_ms: '暂停时间上限',
  max_depth_per_session: '每个会话的排队消息上限', max_delivery_bytes: '单条消息大小上限',
  max_pending_content_bytes_per_session: '每个会话的排队内容大小上限', max_active_sessions: '同时运行的会话上限',
  scheduler_fallback_poll_ms: '待运行会话检查间隔', max_concurrent_requests: '并发请求上限',
  max_concurrent_requests_per_session: '每个会话的并发请求上限', result_memory_grace_s: '结果保留时间',
  trigger_ratio: '压缩触发比例', reserve_tokens: '压缩后预留 Token', worker_interval_ms: '压缩检查间隔',
  max_concurrent_sessions: '同时压缩的会话上限', failure_retry_ms: '压缩失败后的等待时间',
  segment_lower_tokens: '保留原文的片段阈值', segment_upper_tokens: '立即生成 Summary 的片段阈值',
  max_verbatim_message_tokens: '保留原文的消息大小上限', standby_target_ratio: '备用上下文目标比例',
  repartition_parts: '重新分段的片段数量', min_summary_bytes: 'Summary 大小下限', max_summary_bytes: 'Summary 大小上限',
  summary_max_output_tokens: 'Summary 输出 Token 上限', boundary_excerpt_chars: '片段边界摘录字数',
  image_estimated_tokens: '单张图片预估 Token', fallback_bytes_per_token: '每个 Token 预估 Byte 数',
  command: 'Shell 命令', kind: 'Shell 类型', program: '可执行文件', args: '固定启动参数',
  default_soft_timeout_s: '默认执行等待时间', kill_grace_ms: '终止前等待时间', interrupt_kill_grace_ms: '中断后强制终止等待',
  inline_output_bytes: '直接显示的输出大小', poll_default_bytes: '默认读取输出大小', poll_max_bytes: '单次读取输出大小上限',
  poll_max_wait_ms: '读取输出等待上限', reconcile_interval_s: '执行状态检查间隔',
  background_notifications: '后台执行通知', wake_session_on_terminal: '执行结束时唤醒会话',
  max_command_bytes: '命令大小上限', max_rendered_bytes: '通知大小上限', limits: '资源限制',
  max_stdin_write_bytes: '单次输入大小上限', stdin_write_timeout_ms: '写入输入超时',
  max_stdin_total_bytes: '单次执行的输入总量上限', max_output_bytes_per_execution: '单次执行的输出总量上限',
  max_attachment_bytes: '单个附件大小上限', max_attachments_per_message: '每条消息的附件数量上限',
  allowed_mime_types: '允许的图片格式', max_image_bytes: '单张图片大小上限', max_images_per_message: '每条消息的图片数量上限',
  default_kind: '默认图片操作', default_output_images: '默认生成图片数量', max_output_images: '生成图片数量上限',
  max_entries: 'Entry 数量上限', automatic_before_model_call: '每次调用模型前自动测量', near_limit_ratio: '接近容量上限的比例',
  default_direction: '默认读取方向', default_page_items: '默认每页 Entry 数', max_page_items: '每页 Entry 数上限',
  default_window_before: '定位点之前的默认 Entry 数', default_window_after: '定位点之后的默认 Entry 数', max_window_items: '定位窗口 Entry 数上限',
  preview_text_bytes: '正文预览长度', preview_reasoning_bytes: '思考预览长度', preview_tool_arguments_bytes: '工具参数预览长度',
  preview_tool_result_bytes: '工具结果预览长度', change_feed_default_items: '默认变更 Entry 数', change_feed_max_items: '变更 Entry 数上限',
  min_refresh_interval_ms: '最短刷新间隔', max_history_snapshots_per_source: '每个来源的历史快照上限', history_default_items: '默认历史 Entry 数',
  bindings: '账户绑定', endpoints: '服务端点', sources: '用量来源', id: '标识名称', display_name: '显示名称',
  credential: '凭据引用', source: '来源', name: '名称', endpoint: '服务端点', protocol: '通信协议',
  account_binding: '所属账户', method: '请求方法', path: '请求路径', fresh_for_ms: '有效时间', stale_for_ms: '过期时间', request_timeout_ms: '请求超时',
  session_cache_memory_budget_bytes: '会话缓存内存上限', cold: '闲置会话压缩', idle_after_ms: '开始压缩前的闲置时间', zstd_level: '压缩级别',
  session_writer_ttl_ms: '写入租约有效时间', session_writer_heartbeat_ms: '写入租约续期频率', sse_heartbeat_ms: '事件心跳间隔',
  subscriber_buffer_events: '订阅者事件缓冲数量', max_subscribers_per_stream: '每个流的订阅者上限', default_order: '默认排序',
  bundle_enabled: '允许创建诊断包', bundle_retention_s: '诊断包保留时间', bundle_max_bytes: '诊断包大小上限', retention_s: '请求去重记录保留时间', level: '日志级别',
  proxy: '网络代理', upstream: '上游请求限制', providers: '模型提供商', model_catalog_cache_ttl_s: '模型列表缓存时间',
  preset: '提供商预设', api_key: 'API 密钥', credentials: '额外凭据', allow_any_model: '允许使用列表以外的模型', model_id_max_bytes: '模型名称长度上限',
  models: '模型配置', compat: '协议选项', input_count: '输入 Token 计数', dialect: '协议扩展',
  context_window_tokens: '上下文容量', max_output_tokens: '最大输出 Token', input_modalities: '输入类型', output_modalities: '输出类型',
  capabilities: '模型能力', supports_client_tools: '支持工具调用', supports_reasoning: '支持推理', default_reasoning_effort: '默认推理强度', reasoning_efforts: '推理强度映射',
  default_policy: '默认代理策略', artifact_policy: '图片下载代理策略', policies: '代理策略列表', http_url: 'HTTP 代理地址', https_url: 'HTTPS 代理地址', all_url: '通用代理地址',
  type: '验证方式', username: '用户名', password: '密码', first_byte_timeout_ms: '首次响应超时', stream_idle_timeout_ms: '流式响应空闲超时',
  max_response_bytes: '响应大小上限', max_event_bytes: '单个事件大小上限', max_stream_events: '单次流的事件数量上限', max_error_body_bytes: '错误详情大小上限',
  model_list: '模型列表接口', image_edit_path: '图片编辑路径', headers: '额外请求头', query: '额外查询参数', codex: 'Codex 连接',
  default_page_size: '默认每页模型数', max_page_size: '每页模型数上限', generic: '模型列表字段映射', items_pointer: '模型数组位置',
  id_pointer: '模型标识字段', display_name_pointer: '显示名称字段', description_pointer: '描述字段', created_at_pointer: '创建时间字段',
  owned_by_pointer: '所属提供商字段', context_window_pointer: '上下文容量字段', max_output_tokens_pointer: '最大输出字段',
  input_modalities_pointer: '输入类型字段', output_modalities_pointer: '输出类型字段', capabilities_pointer: '模型能力字段',
  next_cursor_pointer: '下一页游标字段', cursor_query_parameter: '游标请求参数', limit_query_parameter: '每页数量请求参数', strip_id_prefix: '移除的模型名称前缀',
  workspace_id: 'workspace ID', value: '值', region: '地区', access_key_id: '访问密钥 ID', secret_access_key: '访问密钥', session_token: '临时访问令牌', credentials_path: '凭据文件路径',
  transport: '传输方式', account_id_source: '账户 ID 来源', account_id: '账户 ID', originator: '客户端名称', request_compression: '请求压缩方式',
  websocket_connect_timeout_ms: 'WebSocket 连接超时', websocket_idle_timeout_ms: 'WebSocket 空闲超时', websocket_cache_ttl_ms: 'WebSocket 缓存时间',
  websocket_cache_max_connections: 'WebSocket 缓存连接上限', session_affinity_max_bytes: '会话关联字段长度上限', fallback_to_sse_before_first_event: '首次响应前允许切换到 SSE',
  supports_developer_role: '支持开发者消息', supports_stream_usage: '支持流式用量统计', max_tokens_field: '输出上限参数名称',
  reasoning_output_field: '思考内容字段', reasoning_replay: '回传思考内容的条件', tool_arguments_wire: '工具参数格式',
  assistant_prefill_field: '助手预填充字段', prompt_cache_key: '提示词缓存标识', unknown_finish_reason: '未知结束原因的处理',
  request_path: '计数请求路径', may_bill: '计数请求可能收费', timeout_ms: '计数请求超时', allow_unverified_overrides: '允许未验证的协议选项', contract_version: '协议选项版本',
};
export function label(key: string) {
  if (i18n.locale.value === 'zh' && labels[key]) return labels[key];
  return key.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}
export function fieldLabel(path: string[]) {
  const key = path.at(-1)!;
  if (key === 'mode' && path.at(-2) === 'auth') return tr('身份验证方式', 'Authentication mode');
  if (key === 'mode' && path.at(-2) === 'input_count') return tr('计数方式', 'Counting mode');
  if (key === 'model' && path[0] === 'retry') return tr('模型请求', 'Model requests');
  return label(key);
}
export function fieldHint(path: string[]): string {
  const help = helpFor(path);
  return help ? tr(...help) : '';
}
export function unit(key: string) {
  if (key.endsWith('_ms')) return tr('毫秒', 'ms');
  if (key.endsWith('_s')) return tr('秒', 'seconds');
  if (key.endsWith('_bytes')) return tr('Byte', 'Byte');
  if (key.endsWith('_chars')) return tr('字符', 'characters');
  if (key.endsWith('_tokens')) return 'Token';
  return '';
}
export function isSecret(path: string[], value: Json | undefined) {
  if (['region', 'workspace_id'].includes(path.at(-1)!) && value !== '<redacted>') return false;
  return value === '<redacted>' || /^(api_key|token|bearer_token|password|access_key_id|secret_access_key|session_token|http_url|https_url|all_url)$/.test(path.at(-1)!)
    || ['credentials', 'headers', 'query'].includes(path.at(-2)!)
    || (path.at(-1) === 'value' && path.at(-2) === 'auth');
}

type ObjectShape = Record<string, Json>;
const modelFields: ObjectShape = {
  context_window_tokens: 0, max_output_tokens: 0, input_modalities: [], output_modalities: [], capabilities: [],
  supports_client_tools: false, supports_reasoning: false, default_reasoning_effort: 'medium', reasoning_efforts: {},
};
const authFields: ObjectShape = {
  token: '', name: '', value: '', region: '', access_key_id: '', secret_access_key: '', session_token: '', credentials_path: '',
};
const compatFields: ObjectShape = {
  supports_developer_role: false, supports_stream_usage: false, max_tokens_field: 'max_tokens', reasoning_output_field: 'none',
  reasoning_replay: 'never', tool_arguments_wire: 'json_string', assistant_prefill_field: 'none', prompt_cache_key: 'optional', unknown_finish_reason: 'error',
};
const modelList: ObjectShape = { protocol: 'auto', path: '/models', method: 'GET', default_page_size: 100, max_page_size: 1000, query: {}, headers: {} };
const codex: ObjectShape = { transport: 'auto', account_id_source: 'jwt_claim', originator: 'wish', request_compression: 'zstd_if_available', websocket_connect_timeout_ms: 15000, websocket_idle_timeout_ms: 120000, websocket_cache_ttl_ms: 300000, websocket_cache_max_connections: 32, session_affinity_max_bytes: 64, fallback_to_sse_before_first_event: true };
const modelMappingFields = Object.fromEntries(['display_name_pointer', 'description_pointer', 'created_at_pointer', 'owned_by_pointer', 'context_window_pointer', 'max_output_tokens_pointer', 'input_modalities_pointer', 'output_modalities_pointer', 'capabilities_pointer', 'next_cursor_pointer', 'cursor_query_parameter', 'limit_query_parameter', 'strip_id_prefix'].map(k => [k, '']));
export function optionalFields(path: string[]): ObjectShape {
  const key = path.at(-1);
  if (path.length === 1 && key === 'wishd') return { default_model: { provider: '', model: '' } };
  if (key === 'default_model') return { reasoning_effort: '' };
  if (path.at(-2) === 'models') return modelFields;
  if (key === 'compat') return compatFields;
  if (path.at(-2) === 'providers') return { base_url: '', path: '', auth: { type: 'none' }, headers: {}, query: {}, model_list: modelList, image_edit_path: '', codex, api_key: '', input_count: { mode: 'provider_preflight', may_bill: false, timeout_ms: 30000 }, dialect: { allow_unverified_overrides: false, contract_version: 1 } };
  if (key === 'model_list') return { base_url: '', auth: { type: 'none' }, generic: { items_pointer: '/data', id_pointer: '/id' } };
  if (key === 'generic') return modelMappingFields;
  if (path.at(-2) === 'policies') return { http_url: '', https_url: '', all_url: '', auth: { type: 'basic', username: '', password: '' } };
  if (key === 'auth' && (path.includes('endpoints') || path.includes('providers'))) return authFields;
  if (key === 'codex') return { account_id: '' };
  if (key === 'input_count') return { request_path: '' };
  return {};
}
export function isMap(path: string[]) {
  return ['models', 'credentials', 'headers', 'query', 'reasoning_efforts'].includes(path.at(-1)!);
}
export function newArrayEntry(path: string[]): Json {
  const key = path.at(-1);
  if (key === 'providers') return { id: '', preset: '', protocol: '', base_url: '', headers: {}, query: {}, api_key: '', credentials: {}, proxy_policy: 'inherit', enabled: true, allow_any_model: false, model_id_max_bytes: 512, models: {}, compat: {} };
  if (key === 'endpoints') return { id: '', base_url: '', proxy_policy: 'inherit' };
  if (key === 'policies') return { id: '', source: 'disabled' };
  if (key === 'bindings') return { id: '', display_name: '', credential: { source: 'env', name: '' } };
  if (key === 'sources') return { id: '', account_binding: '', endpoint: '', protocol: '', method: 'GET', path: '', fresh_for_ms: 300000, stale_for_ms: 1800000, request_timeout_ms: 30000 };
  return '';
}

const optionLabels: Record<string, string> = {
  none: '不使用', bearer: '访问令牌', header: '请求头', query: '查询参数', basic: '用户名和密码',
  aws_sigv4: 'AWS 签名', google_adc: 'Google 凭据', environment: '读取环境变量', manual: '手动设置', disabled: '禁用',
  inherit: '使用默认策略', parallel: '并行执行', serial: '依次执行', generate: '生成图片', edit: '编辑图片',
  auto: '自动选择', forward: '从早到晚', backward: '从晚到早', asc: '从早到晚', desc: '从晚到早',
  off: '关闭', local: '本地计数', provider_preflight: '向提供商查询', never: '不回传', always: '始终回传', tool_calls_only: '仅工具调用时',
};
export const optionLabel = (value: string) => i18n.locale.value === 'zh' ? (optionLabels[value] || value) : value;

export function optionsFor(path: string[], root: ConfigObject, catalog?: ConfigCatalog): string[] | undefined {
  const key = path.at(-1)!;
  const parent = atPath(root, path.slice(0, -1));
  const object = isObject(parent) ? parent : {};
  if (key === 'type' && path.includes('policies')) return ['basic'];
  if (key === 'type' && path.at(-2) === 'auth') return ['none', 'bearer', 'header', 'query', 'aws_sigv4', 'google_adc'];
  if (key === 'mode' && path.at(-2) === 'auth') return ['none', 'bearer'];
  if (key === 'mode' && path.at(-2) === 'input_count') return ['provider_preflight', 'local', 'disabled'];
  if (key === 'source' && path.includes('policies')) return ['environment', 'manual', 'disabled'];
  if (key === 'source' && path.at(-2) === 'credential') return ['env'];
  if (key === 'preset' && catalog) return ['', ...catalog.presets.map(p => p.id)];
  if (key === 'protocol' && path.at(-2) === 'model_list') return ['auto', 'openai_models', 'anthropic_models', 'google_models', 'bedrock_models', 'generic_json'];
  if (key === 'protocol' && path.includes('providers') && catalog) return ['', ...(catalog.presets.find(p => p.id === object.preset)?.protocols || catalog.protocols)];
  if (key === 'protocol' && path[0] === 'providerd' && catalog) return ['', ...catalog.protocols];

  if (['proxy_policy', 'default_policy', 'artifact_policy'].includes(key) && path[0] === 'providerd') {
    const policies = atPath(root, ['providerd', 'proxy', 'policies']);
    return [...(key === 'default_policy' ? [] : ['inherit']), ...(Array.isArray(policies) ? policies.filter(isObject).map(p => String(p.id)) : [])];
  }
  const options: Record<string, string[]> = {
    tool_execution: ['parallel', 'serial'], default_kind: ['generate', 'edit'], default_direction: ['forward', 'backward'],
    default_order: ['asc', 'desc'], level: ['off', 'error', 'warn', 'info', 'debug', 'trace'], method: ['GET', 'POST'],
    transport: ['auto', 'sse', 'websocket'], account_id_source: ['jwt_claim', 'explicit'], request_compression: ['off', 'zstd_if_available', 'zstd_required'],
    reasoning_output_field: ['none', 'reasoning_content'], reasoning_replay: ['never', 'tool_calls_only', 'always'],
    tool_arguments_wire: ['json_string', 'json_object', 'accept_both'], assistant_prefill_field: ['none', 'partial'],
    prompt_cache_key: ['unsupported', 'optional', 'required'], unknown_finish_reason: ['preserve_as_unknown', 'error'],
    max_tokens_field: ['max_tokens', 'max_completion_tokens'], default_reasoning_effort: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  };
  return options[key];
}
