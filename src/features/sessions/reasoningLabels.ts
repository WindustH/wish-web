import { FALLBACK_EFFORT_LEVELS, type ModelInfo } from '../../core/provider-catalog.ts';
export function effortLabel(level?: string) { return level || '…'; }
// A model pulled from an upstream catalog carries no levels of its own, and most presets claim
// none: such a selection resolves to the last fallback level (`max`) instead of 'none', so the
// default the picker highlights is also what a new session sends. A model that declares
// `supports_reasoning: false` still resolves to 'none'.
export function resolvedEffort(explicit: string | undefined, model: Omit<ModelInfo, 'id'> | undefined, providerLevels: Record<string, string | number>) {
  if (explicit) return explicit;
  if (model?.default_reasoning_effort) return model.default_reasoning_effort;
  if (model?.supports_reasoning === false) return 'none';
  const levels = model?.reasoning_efforts ?? providerLevels;
  return ['max','xhigh','high','medium','low','minimal','off'].find(level => Object.hasOwn(levels, level))
    ?? ['enabled','adaptive'].find(level => Object.hasOwn(levels, level))
    ?? FALLBACK_EFFORT_LEVELS[FALLBACK_EFFORT_LEVELS.length - 1];
}
