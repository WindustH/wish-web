import { FALLBACK_EFFORT_LEVELS, type ModelInfo, type ProviderInfo } from '../../core/provider-catalog.ts';
export const sessionCommandNames = ['new', 'btw', 'clear', 'compact', 'rename', 'model', 'effort'] as const;
export interface CommandModel {
  provider: ProviderInfo;
  model: ModelInfo;
}
export const commandText = (input: string) => input.trimStart().replace(/^:/, '').trimStart();
export function parseSessionCommand(input: string) {
  const text = commandText(input).trimEnd();
  const [name = '', ...args] = text.split(/\s+/);
  return { name: name.toLowerCase(), args, question: text.slice(name.length).trim() };
}
export function resolveCommandModel(value: string, models: CommandModel[]) {
  const qualified = models.filter(({ provider, model }) => `${provider.id}/${model.id}` === value);
  if (qualified.length) return qualified;
  return models.filter(({ model }) => model.id === value);
}
export function commandEfforts(choice?: CommandModel): string[] {
  if (!choice) return [];
  const { model, provider } = choice;
  if (model.supports_reasoning === false) return ['none'];
  const levels = Object.keys(model.reasoning_efforts ?? provider.reasoning_efforts ?? {}).filter(
    (key) => !['none', 'auto'].includes(key),
  );
  if (model.default_reasoning_effort && !levels.includes(model.default_reasoning_effort))
    levels.push(model.default_reasoning_effort);
  return [...(model.reasoning_required ? [] : ['none']), ...(levels.length ? levels : FALLBACK_EFFORT_LEVELS)];
}
export function validateCommandEffort(value: string, choice?: CommandModel) {
  if (!value || value.length > 100 || /\s/.test(value)) return false;
  if (choice?.model.supports_reasoning === false || choice?.model.reasoning_required != null)
    return commandEfforts(choice).includes(value);
  return true; // Unconstrained providers also accept custom effort values, like the existing picker.
}
