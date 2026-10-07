// A session's lasting colour wherever groups show it: one of the six chart colours, from its id.
export function peerColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `var(--chart-${hash % 6 + 1})`;
}
