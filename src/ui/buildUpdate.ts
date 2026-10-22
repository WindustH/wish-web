// A network-only build check also works on LAN HTTP, where service workers are unavailable.
// build-info.json is not precached by Workbox; the cache-busting query additionally
// avoids intermediary/browser caches that ignore Cache-Control request directives.
export async function hasNewWebBuild(current: string, request: typeof fetch = fetch): Promise<boolean> {
  const response = await request(`/build-info.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Build check failed (HTTP ${response.status})`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id) {
    throw new Error('Invalid build information');
  }
  return data.id !== current;
}
