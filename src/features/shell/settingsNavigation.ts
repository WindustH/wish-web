import { stringifyQuery } from 'vue-router';
import { extensionSections } from '../../extensions/settings.ts';

export interface SettingsQuery {
  section?: unknown;
  tool?: unknown;
  advanced?: unknown;
  folder?: unknown;
  skill?: unknown;
}

export function extensionSection(value: unknown): string | undefined {
  return typeof value === 'string' && extensionSections.value.some((item) => item.id === value) ? value : undefined;
}

export function skillBrowserPath(folder?: string, skill?: { name: string; dir: string }) {
  return (
    '/settings?' +
    stringifyQuery({
      section: 'skills',
      advanced: 'browse',
      folder: folder || undefined,
      skill: skill?.name,
      dir: skill?.dir,
    })
  );
}

/** The header and system Back must follow the same settings hierarchy, including old deep links. */
export function settingsBackTarget(query: SettingsQuery): string | null {
  if (query.section === 'skills' && query.advanced === 'folders') return '/settings?section=skills';
  if (query.section === 'skills' && query.advanced === 'browse') {
    const folder = typeof query.folder === 'string' ? query.folder : '';
    if (query.skill) return skillBrowserPath(folder);
    if (folder) return skillBrowserPath(folder.split('/').slice(0, -1).join('/'));
    return '/settings?section=skills';
  }
  if (
    query.section === 'shortcuts' &&
    (query.advanced === 'navigation' || query.advanced === 'keymap' || query.advanced === 'browser')
  )
    return '/settings?section=shortcuts';
  if ((query.section === 'extensions' && extensionSection(query.tool)) || extensionSection(query.section))
    return '/settings?section=extensions';
  return query.section ? '/settings' : null;
}
