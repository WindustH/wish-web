// Editable server configuration, matching the serialized /config contract.
import type { ProviderConfig } from './provider-presets.ts';
import type { ToolSwitches } from './api/projections.ts';
export interface AccountConfig {
  name: string;
  preset?: string | null;
  api_key?: string | null;
  api_key_env?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  proxy_enabled: boolean;
  credentials: Record<string, string>;
  credentials_env: Record<string, string>;
}
export interface WebProviderConfig {
  preset: string;
  credential_id?: string | null;
  enabled: boolean;
  proxy_enabled: boolean;
  base_url?: string | null;
  headers?: Record<string, string>;
  auth_provider?: string | null;
  api_key?: string | null;
  api_key_env?: string | null;
}
export interface McpServerConfig {
  enabled: boolean;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string | null;
  url?: string;
  headers?: Record<string, string>;
  auth_provider?: string | null;
  proxy_enabled: boolean;
  scope: 'session' | 'shared';
  idle_timeout: number;
  timeout: number;
}
export interface SettingsConfig {
  listen: string;
  data_dir: string;
  bearer_token_env?: string | null;
  web_dir?: string | null;
  allowed_hosts: string[];
  providers: Record<string, ProviderConfig>;
  accounts: Record<string, AccountConfig>;
  proxy: { mode: 'environment' | 'manual' | 'direct'; url: string; username: string; password: string };
  shell: { program: string; args: string[] | null };
  mcp: { servers: Record<string, McpServerConfig> };
  search: { order: string[]; providers: Record<string, WebProviderConfig> };
  fetch: { order: string[]; providers: Record<string, WebProviderConfig> };
  skills: { dirs: string[]; disabled: string[] };
  usage: { stream_sample_limit: number | null };
  defaults: {
    provider: string;
    model: string;
    cwd: string;
    instructions: string;
    tools: ToolSwitches;
    stream: boolean;
    run: { tools: 'Serial' | 'Parallel'; background_tools_on_input: boolean };
    reasoning?: { effort?: string | null } | null;
    max_output_tokens?: number | null;
    compaction?: Record<string, unknown> | null;
  };
}
