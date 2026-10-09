import type { ProviderPreset } from '../../core/provider-presets.ts';
import { providerName } from '../../ui/providerPresentation.ts';
import { tr } from '../../core/i18n/tr.ts';

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
  'GitHub Copilot': 'https://docs.github.com/copilot', StepFun: 'https://platform.stepfun.ai',
  'Baidu Qianfan': 'https://cloud.baidu.com/doc/qianfan/s/Dmrabu8b6', 'Volcengine Ark': 'https://www.volcengine.com/docs/82379/1925114',
  'Huawei Cloud': 'https://support.huaweicloud.com/Token-plan-maas/tokenplan-maas-0001.html', 'Together AI': 'https://docs.together.ai/',
  Fireworks: 'https://fireworks.ai', 'NVIDIA NIM': 'https://build.nvidia.com', ModelScope: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
  AiHubMix: 'https://aihubmix.com', '302.AI': 'https://302.ai', CherryIN: 'https://open.cherryin.ai', PipeLLM: 'https://www.pipellm.ai',
  '鱼鱼连线': 'https://yylx.io', 'Command Code': 'https://commandcode.ai/docs/provider',
  Magpie: 'https://github.com/yetone/magpie/blob/main/docs/reference.md#connecting-anything-else', oMLX: 'https://omlx.ai',
  'MLX-Serve': 'https://github.com/ddalcu/mlx-serve',
};
export function presetProfile(p: ProviderPreset) {
  const brand = providerName(p.provider);
  const local = p.billing === 'local';
  const codex = p.id === 'openai_codex';
  const aws = p.id === 'aws_bedrock';
  const workspace = p.required_credentials.includes('workspace_id');
  let keyLabel = `${brand} API Key`;
  let keyHint = '';
  let note = '';
  let documentation = docs[p.provider];
  if (codex) {
    keyLabel = 'Access Token';
    keyHint = tr('可以通过 ChatGPT 网页登录；也可以手动填写 Access Token。此预设使用 Codex 订阅接口。', 'Sign in through ChatGPT, or enter an Access Token manually. This preset uses the Codex subscription endpoint.');
    note = tr('网页登录会自动保存账户 ID 并刷新令牌。回调页面需要在运行 Wish 后端的本机浏览器打开。', 'Browser sign-in saves the account ID and refreshes tokens. Open the callback in a browser on the Wish server machine.');
    documentation = 'https://developers.openai.com/codex/auth/';
  } else if (aws) {
    note = tr('此预设使用 AWS SigV4 签名。地区决定 Bedrock 服务地址；临时凭据必须同时填写 Session Token。', 'This preset uses AWS SigV4 signing. The region determines the Bedrock host; temporary credentials also require a Session Token.');
  } else if (p.id === 'github_copilot') {
    keyLabel = 'Copilot Token';
    keyHint = tr('通过 GitHub 登录获取；会话令牌约半小时过期，Wish 会用 GitHub 令牌自动续期。', 'Sign in with GitHub. The session token lasts about half an hour; Wish renews it from the GitHub token.');
    note = tr('Copilot 的多数模型走 Chat Completions，最新的 GPT 模型只走 Responses，Claude 也可走 Messages。一个提供商只用一种协议，其他协议的模型请另建一个 Copilot 提供商并单独登录。', 'Copilot serves most models on Chat Completions, its newest GPT models only on Responses, and Claude on Messages too. A provider speaks one protocol; add another Copilot provider, signed in on its own, for models of another protocol.');
  } else if (p.id === 'magpie') {
    keyLabel = 'Magpie API Key';
    keyHint = tr('Magpie 与 Wish 后端在同一台机器时任意值都可以；局域网共享的 Magpie 需要它的网关密钥。', 'Any value works for a Magpie on the Wish server\'s machine; a Magpie shared on its network needs one of its gateway keys.');
    note = tr('模型名称为 provider/model。服务地址相对于运行 Wish 后端的机器；连接另一台机器的 Magpie 时，同时修改服务地址和账户查询地址。', 'Models are named provider/model. The address is relative to the Wish server; for a Magpie on another machine, change both the base URL and the account base URL.');
  } else if (p.id === 'ollama_cloud') {
    keyHint = tr('填写 ollama.com 创建的 API Key，用于 Ollama 的云端模型。', 'Use an API key created on ollama.com, for Ollama\'s cloud models.');
    documentation = 'https://docs.ollama.com/cloud';
  } else if (!Object.values(p.variants).some(variant => variant.model_list)) {
    keyHint = tr('填写该服务或套餐对应的 API Key。', 'Use the API key of this service or plan.');
    note = tr('该服务不提供模型列表，请在模型中手动添加模型 ID，以服务或套餐页面列出的为准。', 'The service offers no model list; add model IDs by hand, as its service or plan page lists them.');
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
    note = tr('未限定 workspace 的密钥需要在请求头中添加 anthropic-workspace-id，值为 workspace ID。', 'A key not scoped to a workspace needs an anthropic-workspace-id header carrying the workspace ID.');
  }
  return { codex, keyLabel, keyHint, note, documentation };
}
// What a credential field is called in the form.
export const credentialTitle = (field: string): string | undefined => ({
  account_id: tr('账户 ID', 'Account ID'),
  region: tr('AWS 地区', 'AWS Region'),
  access_key_id: 'Access Key ID',
  secret_access_key: 'Secret Access Key',
  session_token: 'Session Token',
  workspace_id: tr('工作空间 ID', 'workspace ID'),
} as Record<string, string>)[field];
