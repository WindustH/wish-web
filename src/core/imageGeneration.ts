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
  required_credentials?: string[];
  optional_credentials?: string[];
  reference_images?: boolean;
  reference_image_limit?: number;
  mask_editing?: boolean;
  markup_editing?: boolean;
  image_required?: boolean;
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
