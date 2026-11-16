export interface PresetService {
  id: string;
  name: string;
}

export interface GenerationPreset {
  id: string;
  name: string;
  brand: string;
  protocol: string;
  model: string;
  service?: PresetService;
}
