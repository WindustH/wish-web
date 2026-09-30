export interface ProviderConfig {
  display_name?: string | null;
  preset?: string | null;
  enabled: boolean;
  proxy_enabled?: boolean;
  protocol: string;
  base_url: string;
  path: string;
  auth: string;
  api_key?: string | null;
  api_key_env?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  credentials: Record<string,string>;
  credentials_env: Record<string,string>;
  headers: Record<string,string>;
  models: Record<string,Record<string,any>>;
  model_list?: string | null;
  model_list_path?: string | null;
  model_list_base_url?: string | null;
  token_count?: string | null;
  compaction?: string | null;
  account_state?: string | null;
  account_state_base_url?: string | null;
}
export interface ProviderPreset {
  id: string;
  provider: string;
  region: string;
  billing: string;
  protocols: string[];
  variants: Record<string,ProviderConfig>;
  required_credentials: string[];
  optional_credentials: string[];
  reasoning_efforts: Record<string,string|number>;
  max_output_tokens?: number;
  unsupported_protocols: string[];
}
export interface ConfigCatalog { presets: ProviderPreset[] }

/** The model-use protocols a provider can speak, as the configuration names them. */
export const MODEL_PROTOCOLS = [
  'openai_responses',
  'plaintext_responses',
  'codex_responses',
  'openai_chat',
  'compatible_chat',
  'deepseek_chat',
  'qwen_chat',
  'kimi_k2_chat',
  'kimi_k3_chat',
  'zai_chat',
  'minimax_chat',
  'mimo_chat',
  'tokenhub_chat',
  'mistral_chat',
  'anthropic_messages',
  'deepseek_messages',
  'qwen_messages',
  'kimi_messages',
  'zai_messages',
  'minimax_messages',
  'mimo_messages',
  'tokenhub_messages',
  'google_generate_content',
  'google_vertex_generate_content',
  'google_interactions',
  'bedrock_converse',
  'mistral_conversations',
];

/** Protocols a provider can be read with on request (the others ride on model replies). */
export const ACCOUNT_PROTOCOLS = [
  'deepseek_user_balance', 'kimi_open_balance', 'kimi_code_companion_usage', 'zai_coding_plan_monitor',
  'minimax_token_plan_remains', 'minimax_account_balance', 'siliconflow_balance', 'openrouter_key_quota',
  'openrouter_credits', 'hf_whoami_billing', 'qwen_workspace_quota', 'openai_codex_usage',
];
