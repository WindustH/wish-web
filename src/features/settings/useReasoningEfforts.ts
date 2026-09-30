import { computed, ref, type Ref } from 'vue';
import { STANDARD_EFFORTS } from '../../core/provider-catalog.ts';
import type { ProviderPreset } from '../../core/provider-presets.ts';
import { tr } from '../../core/i18n/tr.ts';

const DEFAULT_EFFORTS = { low: 'low', medium: 'medium', high: 'high', max: 'max' };

/** A model added to a provider reasons, at the common efforts, unless it says otherwise. */
export function withNewModelDefaults(seed: Record<string, any>) {
  const model = { ...seed };
  if (model.supports_reasoning == null) model.supports_reasoning = true;
  if (model.supports_reasoning !== false && model.reasoning_efforts == null) model.reasoning_efforts = { ...DEFAULT_EFFORTS };
  return model;
}

// Known efforts in their order, weakest first; any others after them, alphabetically.
function sortEfforts(tokens: string[]) {
  const order = ['off', ...STANDARD_EFFORTS];
  return [...tokens].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Editing the reasoning efforts a model in the draft supports: as chips of the common ones, or as
 * comma-separated text. A model without its own list inherits its preset's; each effort keeps the
 * wire value it had, or the preset's, or its own name.
 */
export function useReasoningEfforts(draft: Ref<Record<string, any>>, preset: () => ProviderPreset | undefined) {
  const input = ref('');
  const presetEfforts = computed(() => Object.keys(preset()?.reasoning_efforts ?? {}));
  const isCustom = computed(() => draft.value.reasoning_efforts != null);
  const active = computed<string[]>(() => draft.value.reasoning_efforts != null ? Object.keys(draft.value.reasoning_efforts) : presetEfforts.value);
  const commonOptions = computed(() => sortEfforts([...new Set([...STANDARD_EFFORTS, ...presetEfforts.value, ...active.value].filter(Boolean))]));
  const isActive = (effort: string) => active.value.includes(effort);
  const effortMap = (tokens: string[]) => {
    const existing = draft.value.reasoning_efforts ?? {};
    return Object.fromEntries(tokens.map(token => [token, existing[token] ?? preset()?.reasoning_efforts?.[token] ?? token]));
  };

  function setList(list: string[]) {
    const tokens = sortEfforts(list.map(s => s.trim()).filter(Boolean));
    draft.value.reasoning_efforts = tokens.length ? effortMap(tokens) : {};
    input.value = tokens.join(', ');
  }
  function toggle(effort: string) {
    const list = [...active.value];
    const index = list.indexOf(effort);
    if (index >= 0) list.splice(index, 1);
    else list.push(effort);
    setList(list);
  }
  function onInput(text: string) {
    input.value = text;
    if (!text.trim()) { delete draft.value.reasoning_efforts; return; }
    draft.value.reasoning_efforts = effortMap(text.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean));
  }
  function reset() {
    delete draft.value.reasoning_efforts;
    input.value = '';
  }
  const placeholder = computed(() => presetEfforts.value.length
    ? tr('逗号分隔，留空继承预设：', 'Comma-separated, blank to inherit: ') + presetEfforts.value.join(', ')
    : tr('逗号分隔，如：low, medium, high', 'Comma-separated, e.g. low, medium, high'));
  // The default effort's choices: the model's efforts (or its preset's), and the default it has.
  const defaultOptions = computed(() => [...new Set([...Object.keys(draft.value.reasoning_efforts ?? preset()?.reasoning_efforts ?? {}), draft.value.default_reasoning_effort].filter(Boolean))].map(value => ({ value, label: value })));

  return { input, presetEfforts, isCustom, commonOptions, isActive, toggle, onInput, reset, placeholder, defaultOptions };
}
