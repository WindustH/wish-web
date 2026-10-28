export type MediaKind = 'video' | 'speech' | 'music' | 'sound_effect' | 'transcription';
export interface MediaOptions {
  duration?: number | null;
  voice?: string | null;
  aspect_ratio?: string | null;
  resolution?: string | null;
  instrumental?: boolean | null;
}
export interface MediaService {
  preset: string;
  credential_id: string;
  model: string;
  base_url?: string | null;
  enabled: boolean;
  proxy_enabled: boolean;
  parameters: MediaOptions;
}
export interface MediaPreset {
  id: string;
  name: string;
  brand: string;
  protocol: string;
  kind: MediaKind;
  model: string;
  base_url: string;
  account_presets: string[];
  docs_url: string;
}
export interface MediaArtifact {
  id: string;
  mime_type: string;
  path: string;
  byte_count: number;
}
export interface MediaJob {
  job_id: string;
  kind: MediaKind;
  provider: string;
  model: string;
  status: 'submitting' | 'running' | 'downloading' | 'succeeded' | 'failed' | 'outcome_unknown';
  artifacts: MediaArtifact[];
  error?: string | null;
}
