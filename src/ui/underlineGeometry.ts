export interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One baseline per visual row; separate quoted intervals keep their horizontal gaps. */
export function underlineGeometry(rects: readonly TextRect[]) {
  const rows: { top: number; bottom: number; lower: number; parts: TextRect[] }[] = [];
  for (const rect of rects
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.y - b.y || b.height - a.height)) {
    const bottom = rect.y + rect.height;
    const row = rows.find(
      (line) =>
        Math.min(line.bottom, bottom) - Math.max(line.top, rect.y) >= Math.min(line.bottom - line.top, rect.height) / 2,
    );
    if (row) {
      // The shared vertical band, not the growing union, identifies a row. A tall
      // inline fragment must not join the text on the following wrapped line.
      row.top = Math.max(row.top, rect.y);
      row.bottom = Math.min(row.bottom, bottom);
      row.lower = Math.max(row.lower, bottom);
      row.parts.push(rect);
    } else rows.push({ top: rect.y, bottom, lower: bottom, parts: [rect] });
  }
  return rows.flatMap((row) => {
    const segments: { x: number; y: number; width: number }[] = [];
    for (const rect of row.parts.sort((a, b) => a.x - b.x)) {
      const last = segments.at(-1);
      if (last && rect.x <= last.x + last.width + 1) last.width = Math.max(last.width, rect.x + rect.width - last.x);
      else segments.push({ x: rect.x, y: row.lower + 2, width: rect.width });
    }
    return segments;
  });
}
