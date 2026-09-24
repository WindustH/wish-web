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
