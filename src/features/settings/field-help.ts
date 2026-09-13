// UI explanations of the current wish-config schema. Keep semantics aligned
// with schema.rs, schema/providerd.rs and the owning runtime; validation stays
// on the daemons. Path-specific copy takes precedence over shared field names.
type Help = readonly [zh: string, en: string];
const fields: Record<string, Help> = {
  data_dir: ['更改目录不会搬迁已有数据。', 'Changing this directory does not move existing data.'],
  stateless: ['用会话上下文发起独立查询，不把查询结果追加到原会话。', 'Query a session context independently without appending the result to that session.'],
  compaction: ['将较早的上下文整理为 Summary，为后续对话腾出模型容量。', 'Summarize earlier context to make room for subsequent conversation.'],
  attachments: ['限制普通文件附件的体积和数量，图片使用独立的图片上传限制。', 'Limit file attachment sizes and counts. Images use the separate image upload limits.'],
  listen: ['后端进程绑定的网络地址；更改后需要重启对应服务。', 'Network address bound by the daemon; changes require restarting that service.'],
  host: ['127.0.0.1 仅供本机连接；0.0.0.0 监听所有 IPv4 网卡。', '127.0.0.1 accepts local connections only; 0.0.0.0 listens on every IPv4 interface.'],
  allow_insecure_remote: ['允许在未启用令牌验证时监听非本机地址；不会关闭已经启用的令牌验证。', 'Permit a non-loopback listener without token authentication; existing token authentication is not disabled.'],
  bearer_token: ['wishd 连接模型服务时发送的令牌，需与模型服务的访问令牌一致。', 'Token wishd sends to the provider service; it must match that service’s token.'],
  provider_client: ['wishd 到 wish-providerd 的内部连接，不是模型厂商的 API 地址。', 'The connection from wishd to wish-providerd, not the model vendor’s API.'],
  base_url: ['HTTP 或 HTTPS 地址；请求路径单独填写。', 'HTTP or HTTPS URL; enter the request path separately.'],
  total_timeout_ms: ['一次请求从开始到结束的最长时间，包括流式输出。', 'Maximum duration of an entire request, including streamed output.'],
  stream_read_timeout_ms: ['wishd 等待模型服务下一段响应的最长时间；通常应高于模型服务的流式空闲超时。', 'Maximum wait for the next provider-service response chunk; normally longer than its upstream idle timeout.'],
  default_model: ['仅用于新会话。', 'Applies to new sessions only.'],
  reasoning_effort: ['设置新会话默认的推理强度；可用等级取决于模型。移除此项则不指定。', 'Default reasoning effort for new sessions; supported levels depend on the model. Remove to leave unspecified.'],
  allowed_mime_types: ['每项填写一个 MIME 类型，例如 image/png；列表外的图片格式会被拒绝。', 'One MIME type per entry, such as image/png; unlisted image formats are rejected.'],
  near_limit_ratio: ['达到模型容量的此比例时标记为接近上限；例如 0.9 表示 90%。', 'Mark usage near capacity at this fraction; 0.9 means 90%.'],
  preset: ['提供地址、协议和认证默认值。', 'Supplies address, protocol and authentication defaults.'],
  api_key: ['留空保留已保存的密钥。', 'Leave unchanged to keep the saved key.'],
  credentials: ['支持 ${环境变量名}。', 'Supports ${ENV_VAR}.'],
  models: ['仅修改需要覆盖上游数据的字段。', 'Edit only fields you want to override.'],
  context_window_tokens: ['留空时使用上游容量。', 'Leave blank to use upstream capacity.'],
  max_output_tokens: ['留空时使用模型或协议默认值。', 'Leave blank to use the model or protocol default.'],
  default_reasoning_effort: ['未设置时使用模型默认强度，否则选择最高支持强度；不支持推理时不发送。', 'When unset, use the model default or highest supported effort; omit effort when reasoning is unsupported.'],
  reasoning_efforts: ['映射为上游接受的强度名称或 Token 预算。', 'Map to an upstream effort name or token budget.'],
  max_tokens_field: ['指定请求中控制输出 Token 上限的字段名称。', 'Request field used to specify the output token limit.'],
  reasoning_output_field: ['指定从哪个响应字段读取思考内容；none 表示没有独立字段。', 'Response field containing reasoning; none means no separate field.'],
  allow_unverified_overrides: ['允许使用未由命名协议确认的覆盖项；目标服务仍可能拒绝请求。', 'Permit overrides not verified by the named dialect; the target may still reject them.'],
};
const paths: Record<string, Help> = {
  'wishd/auth': ['验证访问 wishd 的客户端身份；令牌授权可以访问完整 API。', 'Authenticate clients accessing wishd; the token grants access to its full API.'],
  'providerd/auth': ['验证访问模型服务的客户端，包括 wishd 的内部连接。', 'Authenticate provider-service clients, including the connection from wishd.'],
  'wishd/provider_client/base_url': ['填写 wish-providerd 的地址，例如 http://127.0.0.1:9781。', 'Address of wish-providerd, such as http://127.0.0.1:9781.'],
  'wishd/provider_client/proxy_policy': ['direct 直连；environment 读取代理环境变量；手动代理填写 manual:http://代理地址。', 'Use direct, environment, or manual:http://proxy-address.'],
  'streaming/enabled': ['开启后边生成边显示回复；关闭后不推送生成过程中的内容。', 'Deliver reply content as it is generated; disable live generation updates when off.'],
  'compaction/enabled': ['允许后台准备压缩后的上下文；关闭后不自动进行上下文压缩。', 'Allow background preparation of compacted context; disable automatic compaction when off.'],
  'storage/cold/enabled': ['自动压缩闲置会话数据库以节省磁盘，再次访问时恢复。', 'Automatically compress idle session databases and restore them when accessed.'],
  'retry/circuit_breaker/enabled': ['请求频繁失败时暂停调用，再探测恢复；关闭后只使用普通重试策略。', 'Pause repeated failures and probe for recovery; otherwise use ordinary retries only.'],
  'providerd/providers/*/input_count/mode': ['向提供商查询精确计数、使用本地计数，或禁用计数。', 'Use provider preflight counting, local counting, or disable counting.'],
  'account_observation/bindings/*/credential/source': ['目前使用 env，从后端进程环境变量读取凭据。', 'Use env to read credentials from the backend process environment.'],
  'account_observation/bindings/*/credential/name': ['填写保存凭据的环境变量名称，不是凭据本身。', 'Environment variable name containing the credential, not the credential itself.'],
  'account_observation/endpoints/*/proxy_policy': ['direct 直连；environment 读取代理环境变量；也可使用 manual:http://代理地址。', 'Use direct, environment, or manual:http://proxy-address.'],
};
export function helpFor(path: string[]): Help | undefined {
  const normalized = path.map((part, i) => /^\d+$/.test(part) || path[i - 1] === 'models' ? '*' : part).join('/');
  if (paths[normalized]) return paths[normalized];
  const key = path.at(-1)!;
  const parent = path.at(-2);
  // Map keys are user-defined names, never schema field names.
  if (parent === 'credentials') return fields[key] || fields.credentials;
  if (parent && ['headers', 'query', 'reasoning_efforts'].includes(parent)) return undefined;
  if (parent === 'models') return undefined;
  if (/^\d+$/.test(key)) return fields[parent!];
  if (key === 'mode' && parent === 'auth') return ['不使用表示不验证令牌；访问令牌模式要求客户端携带有效令牌。', 'none disables token checks; bearer requires a valid token on client requests.'];
  if (key === 'auth') return ['配置此连接如何向目标服务验证身份。', 'Configure authentication for this connection to the target service.'];
  if (key === 'token') return ['访问令牌模式使用的凭据；未编辑时保留现有值。', 'Credential used for bearer authentication; untouched fields retain the existing value.'];
  if (key === 'name' && parent === 'auth') return ['携带凭据的请求头或查询参数名称。', 'Name of the header or query parameter carrying the credential.'];
  if (key === 'value' && parent === 'auth') return ['填入上述请求头或查询参数的凭据值。', 'Credential value sent in the configured header or query parameter.'];
  if (key.endsWith('_pointer') && parent === 'generic') return ['相对于每个模型对象的 JSON Pointer；移除此项则不映射该属性。', 'JSON Pointer relative to each model object; remove to leave the attribute unmapped.'];
  return fields[key];
}
