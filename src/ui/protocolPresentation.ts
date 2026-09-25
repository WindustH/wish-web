import { i18n } from '../core/i18n/index.ts';
// Display metadata only; option values always retain the backend protocol ID.
const protocols: Record<string, { label: string; brand: string; annotation?: string }> = {
  plaintext_responses: { label: 'Responses · Plaintext reasoning', brand: 'OpenAI' },
  codex_responses: { label: 'Codex Responses', brand: 'OpenAI' },
  bedrock_converse: { label: 'Bedrock Converse', brand: 'AWS Bedrock' },
  kimi_k2_chat: { label: 'Kimi K2 Chat', brand: 'Kimi' },
  kimi_k3_chat: { label: 'Kimi K3 Chat', brand: 'Kimi' },
  tokenhub_chat: { label: 'Tencent TokenHub Chat', brand: 'Tencent Hunyuan (TokenHub)' },
  openai_chat: { label: 'OpenAI Chat', brand: 'OpenAI' },
  openai_chat_completions: { label: 'OpenAI Chat Completions', brand: 'OpenAI' },
  openai_responses: { label: 'OpenAI Responses', brand: 'OpenAI' },
  openai_codex_responses: { label: 'OpenAI Codex Responses', brand: 'OpenAI', annotation: 'OpenAI Responses' },
  openai_images: { label: 'OpenAI Images', brand: 'OpenAI' },
  openai_models: { label: 'OpenAI Models', brand: 'OpenAI' },
  anthropic_messages: { label: 'Anthropic Messages', brand: 'Anthropic' },
  bedrock_converse_stream: { label: 'AWS Bedrock Converse Stream', brand: 'AWS Bedrock' },
  google_generate_content: { label: 'Google Gemini Generate Content', brand: 'Google Gemini' },
  google_interactions: { label: 'Google Gemini Interactions', brand: 'Google Gemini' },
  google_vertex_generate_content: { label: 'Google Vertex AI Generate Content', brand: 'Google Gemini' },
  mistral_conversations: { label: 'Mistral Conversations', brand: 'Mistral' },
  deepseek_chat: { label: 'DeepSeek Chat', brand: 'DeepSeek', annotation: 'OpenAI Chat' },
  deepseek_responses: { label: 'DeepSeek Responses', brand: 'DeepSeek', annotation: 'OpenAI Responses' },
  deepseek_messages: { label: 'DeepSeek Messages', brand: 'DeepSeek', annotation: 'Anthropic Messages' },
  zai_chat: { label: 'Z.AI Chat', brand: 'Z.AI', annotation: 'OpenAI Chat' },
  zai_messages: { label: 'Z.AI Messages', brand: 'Z.AI', annotation: 'Anthropic Messages' },
  zai_images: { label: 'Z.AI Images', brand: 'Z.AI', annotation: 'OpenAI Images' },
  kimi: { label: 'Kimi', brand: 'Kimi', annotation: 'OpenAI Chat' },
  qwen_chat: { label: 'Qwen Chat', brand: 'Qwen', annotation: 'OpenAI Chat' },
  qwen_responses: { label: 'Qwen Responses', brand: 'Qwen', annotation: 'OpenAI Responses' },
  mimo_chat: { label: 'MiMo Chat', brand: 'MiMo', annotation: 'OpenAI Chat' },
  mimo_responses: { label: 'MiMo Responses', brand: 'MiMo', annotation: 'OpenAI Responses' },
  mimo_messages: { label: 'MiMo Messages', brand: 'MiMo', annotation: 'Anthropic Messages' },
  minimax_chat: { label: 'MiniMax Chat', brand: 'MiniMax', annotation: 'OpenAI Chat' },
  minimax_messages: { label: 'MiniMax Messages', brand: 'MiniMax', annotation: 'Anthropic Messages' },
  hunyuan_chat: { label: 'Tencent Hunyuan Chat', brand: 'Tencent Hunyuan (TokenHub)', annotation: 'OpenAI Chat' },
};
const extra: Record<string, {label:string;brand:string;annotation?:string}> = {
  openai_codex_models: {label:'OpenAI Codex Models',brand:'OpenAI'},
  anthropic_models: {label:'Anthropic Models',brand:'Anthropic'},
  google_models: {label:'Google Gemini Models',brand:'Google Gemini'},
  qwen_models: {label:'Qwen Models',brand:'Qwen'},
  bedrock_models: {label:'AWS Bedrock Models',brand:'AWS Bedrock'},
  openai_responses_streamed: {label:'OpenAI Responses · Streaming compaction',brand:'OpenAI'},
  qwen_messages: {label:'Qwen Messages',brand:'Qwen'},
  kimi_messages: {label:'Kimi Messages',brand:'Kimi'},
  tokenhub_messages: {label:'Tencent TokenHub Messages',brand:'Tencent Hunyuan (TokenHub)'},
  mistral_chat: {label:'Mistral Chat',brand:'Mistral'},
};
export function protocolPresentation(id: string) {
  const item = protocols[id] ?? extra[id] ?? {label:id,brand:''};
  const description = i18n.locale.value === 'zh'
    ? {plaintext_responses:'OpenAI Responses · 明文思考', openai_responses_streamed:'OpenAI Responses · 流式压缩'}[id as 'plaintext_responses' | 'openai_responses_streamed']
    : undefined;
  return {...item,label:description ?? item.label};
}
