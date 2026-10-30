import { extensionSections } from '../../extensions/settings.ts';

export interface SettingsQuery {
  section?: unknown;
  tool?: unknown;
}

export function extensionSection(value: unknown): string | undefined {
  return typeof value === 'string' && extensionSections.value.some((item) => item.id === value) ? value : undefined;
}

/** The header and system Back must follow the same settings hierarchy, including old deep links. */
export function settingsBackTarget(query: SettingsQuery): string | null {
  if ((query.section === 'extensions' && extensionSection(query.tool)) || extensionSection(query.section))
    return '/settings?section=extensions';
  return query.section ? '/settings' : null;
}
