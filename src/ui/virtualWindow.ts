/** Fixed-height rows keep the number of mounted controls bounded, independently of list size. */
export function virtualWindow(count: number, rowSize: number, height: number, offset: number, overscan = 3) {
  const size = Math.max(1, rowSize);
  const start = Math.max(0, Math.min(count, Math.floor(Math.max(0, offset) / size) - overscan));
  const end = Math.min(count, Math.ceil((Math.max(0, offset) + height) / size) + overscan);
  return { start, end: Math.max(start, end), total: count * size };
}
