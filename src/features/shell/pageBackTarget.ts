import { settingsBackTarget, type SettingsQuery } from './settingsNavigation.ts';

/** Logical mobile hierarchy, independent of incidental browser entries from dialogs. */
export function pageBackTarget(path: string, query: SettingsQuery, backgroundPath: string): string | null {
  if (path === '/settings') return settingsBackTarget(query) ?? backgroundPath;
  if (path === '/stats' || path === '/data') return backgroundPath;
  const sessionPanel = path.match(/^(\/s\/[^/]+)\/(info|search|settings)$/);
  if (sessionPanel) return sessionPanel[1]!;
  return path === '/sessions' || path === '/' ? null : '/sessions';
}
