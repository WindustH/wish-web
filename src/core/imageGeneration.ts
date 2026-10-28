export interface ImagePreset {
  id: string;
  name: string;
  brand: string;
  protocol: string;
  base_url: string;
  path: string;
  model: string;
  account_presets: string[];
  parameters: Record<string, unknown>;
  docs_url: string;
}
export interface ImageService {
  preset: string;
  credential_id: string;
  model: string;
  base_url?: string | null;
  enabled: boolean;
  proxy_enabled: boolean;
  parameters: Record<string, unknown>;
}
