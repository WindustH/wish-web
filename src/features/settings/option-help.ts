import { tr, optionLabel } from './fields';
const options: Record<string, Record<string, [string, string, string, string]>> = {
  account_id_source: {
    jwt_claim: ['从 Access Token 解析', 'Read from Access Token', '从 Access Token 的 JWT 声明中读取 ChatGPT 账户 ID，无需手动填写。Token 必须包含账户 ID。', 'Read the ChatGPT account ID from the Access Token JWT claims. The token must contain an account ID.'],
    explicit: ['手动指定', 'Specify manually', '使用手动填写的 ChatGPT Account ID；适用于 Token 无法解析账户 ID，或需要明确指定账户的情况。', 'Use the manually entered ChatGPT Account ID when it cannot be read from the token or an explicit account is needed.'],
  },
  transport: {
    auto: ['自动选择', 'Automatic', '由 Codex 协议实现选择传输方式。', 'Let the Codex implementation select the transport.'],
    sse: ['SSE', 'SSE', '通过 HTTP 连接持续接收服务端事件。', 'Receive server events over an HTTP connection.'],
    websocket: ['WebSocket', 'WebSocket', '使用 WebSocket 连接；是否在首个事件前回退到 SSE 由下方回退设置决定。', 'Use WebSocket. The fallback setting controls whether SSE can be used before the first event.'],
  },
  request_compression: {
    off: ['不压缩', 'No compression', '直接发送请求正文。', 'Send the request body without compression.'],
    zstd_if_available: ['可用时使用 Zstandard', 'Zstandard when available', '支持时使用 Zstandard 压缩请求正文。', 'Compress the request body with Zstandard when available.'],
    zstd_required: ['必须使用 Zstandard', 'Require Zstandard', '要求使用 Zstandard；无法压缩时请求报错。', 'Require Zstandard; fail if compression is unavailable.'],
  },
};
export function settingOption(path: string[], value: string) {
  const help = options[path.at(-1)!]?.[value];
  return help ? { label: tr(help[0], help[1]), description: tr(help[2], help[3]) } : { label: optionLabel(value), description: undefined };
}
