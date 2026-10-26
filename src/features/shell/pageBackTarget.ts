/** Logical mobile hierarchy, independent of incidental browser entries from dialogs. */
export function pageBackTarget(path: string, hasSettingsSection: boolean, backgroundPath: string): string | null {
  if (path === '/settings') return hasSettingsSection ? '/settings' : backgroundPath;
  if (path === '/stats' || path === '/data') return backgroundPath;
  const sessionPanel = path.match(/^(\/s\/[^/]+)\/(info|search|settings)$/);
  if (sessionPanel) return sessionPanel[1]!;
  return path === '/sessions' || path === '/' ? null : '/sessions';
}
