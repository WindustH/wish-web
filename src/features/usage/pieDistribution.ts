export interface PieItem { name: string; value: number }
export interface PieSlice extends PieItem { share: number; displayShare: number; members: PieItem[] }

// Give small slices room without letting the display depart too far from usage.
export function pieDistribution(items: PieItem[], otherName: string): PieSlice[] {
  const positive = items.filter(item => item.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  const groups = positive.map(item => ({ ...item, members: [item] }));
  let merged: PieItem[] = [];
  for (;;) {
    const candidate = merged.length ? [...groups, {
      name: otherName, value: merged.reduce((sum, item) => sum + item.value, 0), members: merged,
    }] : groups;
    const shares = candidate.map(item => item.value / total);
    const display = [...shares];
    const fixed = new Set<number>();
    for (;;) {
      const remaining = shares.reduce((sum, share, index) => sum + (fixed.has(index) ? 0 : share), 0);
      const budget = 1 - fixed.size * 0.03;
      let changed = false;
      for (let index = 0; index < shares.length; index++) {
        if (fixed.has(index)) continue;
        display[index] = shares[index]! / remaining * budget;
        if (display[index]! < 0.03) { fixed.add(index); changed = true; }
      }
      if (!changed) break;
      if (fixed.size * 0.03 >= 1) break;
    }
    for (const index of fixed) display[index] = 0.03;
    const error = shares.reduce((sum, share, index) => sum + Math.abs(display[index]! - share), 0);
    if (fixed.size * 0.03 < 1 && error <= 0.10 + 1e-12) {
      return candidate.map((item, index) => ({ ...item, share: shares[index]!, displayShare: display[index]! }));
    }
    merged = [...groups.pop()!.members, ...merged];
    // A combined “Other” represents at least two models.
    if (merged.length === 1) merged = [...groups.pop()!.members, ...merged];
  }
}
