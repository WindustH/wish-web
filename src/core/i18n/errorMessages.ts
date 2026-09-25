// Readable, localized text for errors raised while loading or saving
// settings. The server reports plain English messages with no codes, so the
// Chinese text is matched on those messages; anything unknown is shown as is.
import { i18n } from './index.js';

type Rule = [RegExp, (...groups: string[]) => string];

const phases: Record<string, string> = { connect: '连接', 'await headers': '等待响应', 'read body': '读取响应' };
const secrets: Record<string, string> = { 'API key': 'API 密钥', 'refresh token': '刷新令牌', credential: '凭据', header: '请求头' };

const zh: Rule[] = [
  // Configuration saves (server/configuration.rs, server/config.rs).
  [/^configuration changed; reload before saving$/, () => '配置已在其他地方修改，请重新载入后再保存。'],
  [/^redacted (API key|refresh token|credential|header) has no stored value$/, kind => `${secrets[kind] ?? kind}显示为已隐藏，但服务器上没有保存它的值，请重新填写。`],
  [/^listen, data_dir and bearer_token_env are startup settings; edit the file and restart$/, () => 'listen、data_dir 和 bearer_token_env 是启动参数，请直接编辑配置文件并重启服务。'],
  [/^default provider does not exist$/, () => '默认模型所属的提供商不存在，请重新选择默认模型。'],
  [/^default cwd must be absolute$/, () => '默认工作目录必须是绝对路径。'],
  [/^shell program must be an absolute path$/, () => 'Shell 程序必须填写绝对路径。'],
  [/^shell program (.+) is not an executable file$/, path => `Shell 程序 ${path} 不是可执行文件。`],
  [/^manual proxy requires a URL$/, () => '手动代理需要填写代理地址。'],
  [/^proxy URL must be valid$/, () => '代理地址格式不正确。'],
  [/^manual proxy URL must use http:\/\/ or https:\/\/$/, () => '代理地址必须以 http:// 或 https:// 开头。'],
  [/^put proxy credentials in the username and password fields, not the URL$/, () => '请把代理账号填写在用户名和密码中，不要写在代理地址里。'],
  [/^proxy username is required when password is set$/, () => '填写代理密码时也需要填写用户名。'],
  [/^environment variable (\S+) is missing$/, name => `服务器上没有环境变量 ${name}。`],
  [/^environment variable (\S+) is empty$/, name => `服务器上的环境变量 ${name} 为空。`],
  [/^invalid compaction configuration: require 0 < target_tokens < trigger_tokens and segment_tokens > 0$/, () => '上下文压缩设置无效：压缩后的目标 Token 数必须大于 0 且小于触发压缩的 Token 数，分段摘要阈值必须大于 0。'],
  [/^invalid compaction configuration: bytes_per_token must be finite and positive$/, () => '上下文压缩设置无效：bytes_per_token 必须是正数。'],
  // Provider validation (server/provider.rs and the protocol layer).
  [/^unknown provider preset: (.+)$/, id => `未知的提供商预设：${id}`],
  [/^unknown credential: (.+)$/, field => `未知的凭据字段：${field}`],
  [/^unknown token-count protocol$/, () => '未知的 Token 计数协议。'],
  [/^unknown compaction protocol$/, () => '未知的上游压缩协议。'],
  [/^unknown model-use protocol: (.+)$/, name => `未知的模型协议：${name}`],
  [/^request build failed: unknown model list protocol `(.+)`$/, id => `未知的模型列表协议：${id}`],
  [/^request build failed: unknown account protocol `(.+)`$/, id => `未知的账户协议：${id}`],
  [/^request build failed: outbound base URL `(.*)` is not an absolute http\(s\) URL$/, url => `服务地址 ${url || '（空）'} 不是完整的 http:// 或 https:// 地址。`],
  [/^request build failed: outbound path is empty$/, () => '请求路径不能为空。'],
  [/^request build failed: proxy (\S+): (.+)$/, (url, reason) => `代理 ${url} 无法使用：${reason}`],
  [/^request build failed: client build failed: (.+)$/, reason => `无法创建网络客户端：${reason}`],
  [/^request build failed: this call needs the `(.+)` credential$/, field => `缺少凭据 ${field}。`],
  [/^request build failed: (.+)$/, reason => `无法构造请求：${reason}`],
  [/^unsupported token counting on `(.+?)`: .+$/, id => `Token 计数协议 ${id} 不适用于这个提供商的模型协议或部署。`],
  [/^unsupported upstream compaction on `(.+?)`: .+$/, id => `上游压缩协议 ${id} 不适用于这个提供商的模型协议或部署。`],
  [/^unsupported model list on `(.+?)`: .+$/, id => `${id} 不提供模型列表。`],
  [/^unsupported (.+?) on `(.+?)`: (.+)$/, (feature, id, reason) => `${id} 不支持 ${feature}：${reason}`],
  // Per-session settings.
  [/^only model(?:, reasoning and output limit| and reasoning settings) can change while running$/, () => '会话运行时只能修改模型、思考强度和输出上限，请等本轮运行结束后再保存这些设置。'],
  [/^session changed; reload before saving$/, () => '会话已在其他地方修改，请重新打开会话设置后再保存。'],
  [/^session is running$/, () => '会话正在运行，请等本轮运行结束后再试。'],
  [/^this session has no shell tool$/, () => '这个会话没有启用 Shell 工具。'],
  // Model catalog and runtime failures.
  [/^model_list_path is not configured$/, () => '这个提供商没有配置模型列表路径。'],
  [/^server is shutting down$/, () => '服务正在关闭，请稍后重试。'],
  [/^not found$/, () => '请求的内容不存在。'],
  [/^unauthorized$/, () => '未通过身份验证，请检查访问令牌。'],
  [/^malformed upstream payload: (.+)$/s, reason => `上游返回的数据无法解析：${reason}`],
  [/^upstream error \((.+?)\): (.+)$/s, (code, message) => `上游服务返回错误（${code}）：${message}`],
  [/^upstream error: (.+)$/s, message => `上游服务返回错误：${message}`],
  [/^transport failed: (connect|await headers|read body): (.+)$/s, (phase, message) => `网络请求失败（${phases[phase] ?? phase}）：${message}`],
  [/^credential renewal needed: the material expired at (.+)$/, time => `凭据已于 ${time} 过期，请重新登录或更新凭据。`],
  // ChatGPT sign-in (server/codex_login.rs).
  [/^provider is not an OpenAI Codex preset$/, () => '这个提供商不是 OpenAI Codex 预设。'],
  [/^configuration kept changing during Codex login$/, () => '登录期间配置一直在变化，请重试。'],
  [/^ChatGPT login is available only for the Codex preset$/, () => '只有 Codex 预设支持通过 ChatGPT 登录。'],
  [/^start a ChatGPT login before submitting its redirect URL$/, () => '请先开始 ChatGPT 登录，再提交授权链接。'],
  [/^ChatGPT login expired or is no longer pending; start again$/, () => 'ChatGPT 登录已过期或已结束，请重新开始。'],
  [/^paste the complete redirect URL from the browser$/, () => '请粘贴浏览器地址栏中的完整授权链接。'],
  [/^redirect URL does not match this login attempt$/, () => '授权链接与本次登录不匹配。'],
  [/^redirect URL has duplicate (state|code)$/, name => `授权链接中的 ${name} 参数重复。`],
  [/^authorization state did not match$/, () => '授权状态不匹配，请重新登录。'],
  [/^redirect URL contains no authorization code$/, () => '授权链接中没有授权码。'],
  [/^login attempt is no longer pending$/, () => '本次登录已经结束。'],
  [/^login attempt was replaced$/, () => '本次登录已被新的登录取代。'],
  [/^Codex login callback ports 1455 and 1457 are unavailable$/, () => 'Codex 登录回调端口 1455 和 1457 都已被占用。'],
  [/^ChatGPT token exchange returned HTTP (\d+)$/, status => `ChatGPT 令牌交换失败（HTTP ${status}）。`],
  [/^ChatGPT login did not return a Codex account ID$/, () => 'ChatGPT 登录没有返回 Codex 账户 ID。'],
  [/^access_denied$/, () => '授权已被拒绝。'],
  // Configuration shape errors reported by serde.
  [/^missing field `(.+)`$/, field => `缺少必填字段 ${field}。`],
  [/^unknown field `(.+?)`, (?:expected .+|there are no fields)$/, field => `不支持的字段 ${field}。`],
  [/^unknown variant `(.*?)`, expected (?:one of )?(.+)$/, (value, expected) => `无效的选项 ${value || '（空）'}，可选值：${expected.replaceAll('`', '').replaceAll(', ', '、')}`],
  [/^invalid type: string "", expected (?:u8|u16|u32|u64|usize|i32|i64|f32|f64|.*integer.*|.*number.*)$/, () => '数字不能为空。'],
  [/^invalid type: (.+), expected (.+)$/, (actual, expected) => `类型不正确：需要 ${expected}，实际是 ${actual}。`],
  [/^invalid value: (.+), expected (.+)$/, (actual, expected) => `取值无效：${actual}，需要 ${expected}。`],
  [/^duplicate field `(.+)`$/, field => `字段 ${field} 重复。`],
  // Checks made in the browser before saving.
  [/^Choose an existing provider before selecting a model\.$/, () => '请先选择一个已存在的提供商，再选择模型。'],
  [/^Model ID "(.+)" is unavailable for provider "(.+)"\. Use the exact upstream ID\.$/, (model, provider) => `提供商 ${provider} 没有模型 ${model}，请使用上游的准确模型 ID。`],
  [/^Model catalog repeated a cursor: (.+)$/, id => `${id} 的模型目录分页出现重复，无法读完。`],
  [/^request timed out$/, () => '请求超时，请稍后重试。'],
  [/^(?:Failed to construct 'URL': Invalid URL|URL constructor: .+ is not a valid URL\.|The string did not match the expected pattern\.)$/, () => '服务地址格式不正确，请填写完整的 http:// 或 https:// 地址。'],
  [/^(?:Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/, () => '无法连接到服务，请检查网络或服务是否在运行。'],
];

/** The underlying message: the server's text for API errors, else the error's own. */
export function errorSource(error: unknown): string {
  if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string' && error.detail) return error.detail;
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

/** Localized text plus the original message when the two differ. */
export function describeError(error: unknown): { message: string; original?: string } {
  const source = errorSource(error).trim();
  if (i18n.locale.value !== 'zh') return { message: sentence(source) };
  if (error instanceof SyntaxError) return { message: 'JSON 格式不正确，请检查括号、引号和逗号。', original: source };
  for (const [pattern, render] of zh) {
    const match = pattern.exec(source);
    if (match) return { message: render(...match.slice(1)), original: source };
  }
  return { message: source };
}

function sentence(text: string) {
  if (!text) return text;
  const head = text[0]!.toUpperCase() + text.slice(1);
  return /[.!?。！？)]$/.test(head) ? head : `${head}.`;
}
