export type MediaKind = 'video' | 'speech' | 'music' | 'sound_effect' | 'transcription';
export interface MediaOptions {
  duration?: number | null;
  duration_hint?: string | null;
  language?: string | null;
  watermark?: boolean | null;
  voice?: string | null;
  speed?: number | null;
  volume?: number | null;
  pitch?: number | null;
  emotion?: string | null;
  speech_output?: { codec: 'mp3' | 'wav'; sample_rate?: number | null; bit_rate?: number | null } | null;
  with_timestamps?: boolean | null;
  text_normalization?: boolean | null;
  pronunciation?: Record<string, string> | null;
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
export type VideoMode = 'text' | 'frames' | 'reference' | 'edit' | 'extend';
export interface VideoCapabilities {
  modes: VideoMode[];
  input_roles: string[];
  blob_inputs: string[];
  notes: string;
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
  required_credentials?: string[];
  optional_credentials?: string[];
  defaults?: MediaOptions;
  resolutions?: string[];
  aspect_ratios?: string[];
  video?: VideoCapabilities | null;
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
  timestamps?: MediaArtifact | null;
  error?: string | null;
}
