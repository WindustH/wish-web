import type { ProviderPreset } from '../../core/config-editor';
import { providerName } from '../../ui/providerPresentation';
import { tr } from './fields';

// Presentation only: protocols, required fields and addresses come from the catalog.
// Authentication notes were checked against the implementation and official docs;
// see doc/provider-settings-review.md for sources and verification limits.
const docs: Record<string, string> = {
  DeepSeek: 'https://api-docs.deepseek.com/', MiMo: 'https://platform.xiaomimimo.com/#/docs',
  'Z.ai': 'https://docs.z.ai/api-reference/introduction', Zhipu: 'https://docs.bigmodel.cn/',
  SiliconFlow: 'https://docs.siliconflow.cn/docs/userguide/quickstart', Qwen: 'https://help.aliyun.com/en/model-studio/get-api-key',
  Kimi: 'https://platform.kimi.ai/docs/api/overview', 'Tencent Hunyuan (TokenHub)': 'https://cloud.tencent.com/document/product/1729',
  OpenAI: 'https://platform.openai.com/docs/api-reference/authentication', Anthropic: 'https://platform.claude.com/docs/en/api/overview',
  'Google Gemini': 'https://ai.google.dev/gemini-api/docs/api-key', 'AWS Bedrock': 'https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html',
  MiniMax: 'https://platform.minimax.io/docs/guides/quickstart-preparation', OpenRouter: 'https://openrouter.ai/docs/api_reference/authentication',
  'Hugging Face Router': 'https://huggingface.co/docs/inference-providers/en/index', OpenCode: 'https://opencode.ai/docs/zen/',
  Mistral: 'https://docs.mistral.ai/', xAI: 'https://docs.x.ai/overview', Groq: 'https://console.groq.com/docs/quickstart',
  Cerebras: 'https://inference-docs.cerebras.ai/quickstart', Ollama: 'https://docs.ollama.com/api/authentication',
  'LM Studio': 'https://lmstudio.ai/docs/developer/core/authentication', vLLM: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server/',
};
export function presetProfile(p: ProviderPreset) {
  const brand = providerName(p.provider);
  const local = p.billing === 'local';
  const codex = p.id === 'openai_codex';
  const aws = p.id === 'aws_bedrock';
  const workspace = p.required_credentials.includes('workspace_id');
  let keyLabel = `${brand} API Key`;
  let keyHint = tr(`填写 ${brand} 平台签发、适用于当前地区和套餐的 API Key。`, `Use a ${brand} API key for this region and plan.`);
  let note = '';
  let documentation = docs[p.provider];
  if (codex) {
    keyLabel = 'Access Token';
    keyHint = tr('填写 ChatGPT 登录得到的 Access Token。当前预设连接 Codex 订阅接口，不使用 OpenAI Platform API Key。', 'Use the Access Token from ChatGPT sign-in. This preset connects to the Codex subscription endpoint, not OpenAI Platform API-key billing.');
    note = tr('Wish 当前不会发起登录或自动刷新 Token；Token 过期后需要更新。账户 ID 默认从 Token 解析，也可手动指定。', 'Wish does not currently initiate sign-in or refresh tokens. Replace an expired token. The account ID is read from the token unless explicitly configured.');
    documentation = 'https://developers.openai.com/codex/auth/';
  } else if (aws) {
    note = tr('此预设使用 AWS SigV4 签名。地区决定 Bedrock 服务地址；临时凭据必须同时填写 Session Token。', 'This preset uses AWS SigV4 signing. The region determines the Bedrock host; temporary credentials also require a Session Token.');
  } else if (local) {
    note = tr('服务地址相对于运行 Wish 后端的机器；127.0.0.1 不是浏览器所在的机器。服务需已启动并提供所选模型。', 'The address is relative to the Wish backend host; 127.0.0.1 is not the browser host. Start the service and make the selected model available.');
  } else if (p.id === 'huggingface_router') {
    keyLabel = 'Hugging Face Token';
    keyHint = tr('使用具有 Make calls to Inference Providers 权限的用户 Token。', 'Use a user token with Make calls to Inference Providers permission.');
    note = tr('模型名称使用 Hugging Face 的模型 ID；可用性取决于推理提供商及账户权限。', 'Use the Hugging Face model ID. Availability depends on the inference provider and account access.');
  } else if (p.id === 'google_gemini') {
    keyLabel = 'Gemini API Key';
    keyHint = tr('填写 Google AI Studio 创建的 Gemini API Key。此预设使用 Gemini 的 OpenAI 兼容接口。', 'Use a Gemini API key created in Google AI Studio. This preset uses the Gemini OpenAI-compatible API.');
    note = tr('此预设不使用 Vertex AI 的项目、地区或 ADC 凭据。', 'This preset does not use Vertex AI project, location or ADC credentials.');
  } else if (workspace) {
    keyHint = tr('填写所选地区及 workspace 对应的 Model Studio API Key。', 'Use a Model Studio API key for the selected region and workspace.');
    note = tr('workspace ID 会组成服务地址，请填写 ID，而非显示名称。', 'The workspace ID forms part of the service host; enter the ID, not the display name.');
  } else if (p.id.startsWith('minimax_token_')) {
    keyLabel = 'Subscription Key';
    keyHint = tr('填写 MiniMax Token Plan 的 Subscription Key，不能与按量付费 API Key 混用。', 'Use the MiniMax Token Plan Subscription Key, not a pay-as-you-go API key.');
    documentation = 'https://platform.minimax.io/docs/token-plan/intro';
  } else if (p.id === 'kimi_code') {
    keyLabel = 'Kimi Code API Key';
    keyHint = tr('填写 Kimi Code 服务的 API Key，并确认账户有可用套餐资源。', 'Use an API key for Kimi Code with available plan resources.');
    documentation = 'https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/providers.md';
  } else if (p.id.startsWith('opencode_')) {
    const plan = p.id === 'opencode_go' ? 'Go' : 'Zen';
    keyLabel = `OpenCode ${plan} API Key`;
    keyHint = tr(`填写 OpenCode 账户的 API Key，此预设使用 ${plan} 服务地址。`, `Use your OpenCode account API key. This preset connects to ${plan}.`);
    documentation = `https://opencode.ai/docs/${plan.toLowerCase()}/`;
    note = tr('按目标模型选择协议；同一账户不代表所有模型都能使用同一种协议。', 'Select the protocol for the target model; one account does not imply one protocol works for every model.');
  } else if (p.billing === 'coding_plan' || p.billing === 'token_plan') {
    const plan = p.billing === 'coding_plan' ? 'Coding Plan' : 'Token Plan';
    keyLabel = `${brand} ${plan} API Key`;
    keyHint = tr(`填写 ${brand} ${plan} 对应的 API Key。请在套餐页面确认密钥与可用额度。`, `Use the API key for ${brand} ${plan}. Check the key and available resources on the plan page.`);
    note = tr('此预设使用套餐对应的服务地址；修改地址或认证信息可能改变实际使用的服务。', 'This preset uses the plan-specific service address. Overriding the address or authentication can change the service used.');
    if (p.id.startsWith('zai_')) documentation = 'https://docs.z.ai/devpack/quick-start';
  } else if (p.id === 'openrouter') {
    note = tr('填写 OpenRouter 签发的 API Key；模型名称使用其目录中的完整 ID。', 'Use an OpenRouter-issued API key and the full model ID from its catalog.');
  } else if (p.id === 'anthropic') {
    keyHint = tr('填写 Claude Console 签发的 API Key；当前预设通过 x-api-key 发送。', 'Use an API key from Claude Console; this preset sends it through x-api-key.');
    note = tr('多 workspace 密钥需要在额外请求头中填写 anthropic-workspace-id。', 'Multi-workspace keys require anthropic-workspace-id in additional headers.');
  }
  return { local, codex, aws, workspace, keyLabel, keyHint, note, documentation };
}
export const credentialPresentation = (field: string) => ({
  region: { title: 'AWS Region', hint: tr('填写 Bedrock 所在地区，例如 us-east-1。', 'Bedrock region, for example us-east-1.') },
  access_key_id: { title: 'Access Key ID', hint: tr('与 Secret Access Key 配对的 AWS 凭据 ID。', 'AWS credential ID paired with the Secret Access Key.') },
  secret_access_key: { title: 'Secret Access Key', hint: tr('用于为 Bedrock 请求生成 AWS SigV4 签名。', 'Used to sign Bedrock requests with AWS SigV4.') },
  session_token: { title: 'Session Token', hint: tr('使用临时 AWS 凭据时填写，需与上面两项来自同一组凭据。', 'Required for temporary AWS credentials; must belong to the same credential set above.') },
  workspace_id: { title: 'workspace ID', hint: tr('填写当前地区的 workspace ID。', 'Enter the workspace ID in the selected region.') },
} as Record<string, { title: string; hint: string }>)[field];
