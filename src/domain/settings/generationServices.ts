import type { GenerationPreset } from '../../core/generationPresets.ts';
import type { ImagePreset, ImageService } from '../../core/imageGeneration.ts';
import type { MediaPreset, MediaService } from '../../core/mediaGeneration.ts';

export interface GenerationPresetGroup<T extends GenerationPreset> {
  id: string;
  name: string;
  brand: string;
  presets: T[];
  defaultPreset: T;
}

// Group only explicitly related templates. A shared brand alone does not imply compatible
// accounts, regions or endpoints. Older servers without service metadata remain usable.
export function generationServices<T extends GenerationPreset>(presets: T[]): GenerationPresetGroup<T>[] {
  const groups = new Map<string, GenerationPresetGroup<T>>();
  for (const preset of presets) {
    const id = preset.service?.id ?? preset.id;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name: preset.service?.name ?? preset.name,
        brand: preset.brand,
        presets: [],
        defaultPreset: preset,
      };
      groups.set(id, group);
    }
    group.presets.push(preset);
    if (preset.id === id) group.defaultPreset = preset;
  }
  return [...groups.values()];
}

export const generationServiceName = (preset?: GenerationPreset) => preset?.service?.name ?? preset?.name;

export function generationModelPreset<T extends GenerationPreset>(
  presets: T[],
  id: string,
  model: string,
): T | undefined {
  const current = presets.find((preset) => preset.id === id);
  if (current?.model === model) return current;
  // A manually entered known model may still use the service's original template ID.
  return presets.find((preset) => preset.protocol === current?.protocol && preset.model === model);
}

export function selectImageModel(service: ImageService, previous: ImagePreset, next: ImagePreset): boolean {
  const reset = previous.protocol !== next.protocol && Object.keys(service.parameters).length > 0;
  if (reset) service.parameters = {};
  service.preset = next.id;
  service.model = next.model;
  return reset;
}

export function selectMediaModel(service: MediaService, next: MediaPreset) {
  const options = { ...service.parameters };
  if (options.resolution && !next.resolutions?.includes(options.resolution)) delete options.resolution;
  if (options.aspect_ratio && !next.aspect_ratios?.includes(options.aspect_ratio)) delete options.aspect_ratio;
  if (next.video?.modes.length === 1 && next.video.modes[0] === 'edit') delete options.duration;
  service.preset = next.id;
  service.model = next.model;
  service.parameters = options;
}
