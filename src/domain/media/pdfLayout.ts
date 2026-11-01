// Unknown pages start at A4 proportions; measured pages keep their own aspect ratio.
export function pdfLayout(count: number, width: number, ratios: ReadonlyMap<number, number>, gap = 10) {
  const starts: number[] = [];
  const heights: number[] = [];
  let total = 0;
  for (let index = 0; index < count; index++) {
    starts.push(total);
    const height = width * (ratios.get(index) ?? Math.SQRT2);
    heights.push(height);
    total += height + (index + 1 < count ? gap : 0);
  }
  return { starts, heights, total };
}

export function pdfPageAt(starts: readonly number[], offset: number) {
  let low = 0,
    high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle]! <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export function pdfWindow(starts: readonly number[], offset: number, height: number) {
  if (!starts.length) return [];
  const start = Math.max(0, pdfPageAt(starts, offset) - 1);
  const end = Math.min(starts.length - 1, pdfPageAt(starts, offset + height) + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
