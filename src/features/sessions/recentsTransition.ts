// Recent conversations are ordered by time across folders; the full list has folders,
// pinned entries and section headings. Crossfade the two views instead of matching rows.
const LIFT = 24;

export function paintRecentsTransition(pane: HTMLElement, page: HTMLElement, progress: number, moving: boolean) {
  const value = Math.max(0, Math.min(1, progress));
  const opened = value === 1;
  pane.style.visibility = !moving && !opened ? 'hidden' : 'visible';
  pane.inert = !moving && !opened;
  pane.style.willChange = moving ? 'transform, opacity' : '';
  pane.style.opacity = moving ? String(value) : '';
  pane.style.transform = moving ? `translateY(${(1 - value) * LIFT}px)` : '';
  page.style.visibility = !moving && opened ? 'hidden' : 'visible';
  page.inert = !moving && opened;
  page.style.willChange = moving ? 'opacity' : '';
  page.style.opacity = moving ? String(1 - value) : '';
}

export function clearRecentsTransition(pane: HTMLElement | null, page: HTMLElement | null) {
  for (const node of [pane, page]) {
    if (!node) continue;
    node.style.visibility = node.style.opacity = node.style.transform = node.style.willChange = '';
    node.inert = false;
  }
}
