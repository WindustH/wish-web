import type { ModelInfo } from '../../core/provider-catalog';
export function effortLabel(level?: string) { return level || '…'; }
// Mirrors providerd's default selection; an absent selection is not an option.
export function resolvedEffort(explicit: string | undefined, model: Omit<ModelInfo, 'id'> | undefined, providerLevels: Record<string, string | number>) {
  if (explicit) return explicit;
  if (model?.default_reasoning_effort) return model.default_reasoning_effort;
  if (model?.supports_reasoning === false) return 'none';
  const levels = model?.reasoning_efforts ?? providerLevels;
  return ['max','xhigh','high','medium','low','minimal','off'].find(level => Object.hasOwn(levels, level))
    ?? ['enabled','adaptive'].find(level => Object.hasOwn(levels, level)) ?? 'none';
}
