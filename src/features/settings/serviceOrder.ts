/** Keep valid unique order entries, then append configured services omitted from it. */
export function serviceOrder(order: readonly string[], providers: Record<string, unknown>): string[] {
  return [...new Set([...order, ...Object.keys(providers)])].filter((id) => {
    const value = providers[id];
    return value != null && typeof value === 'object' && !Array.isArray(value);
  });
}
