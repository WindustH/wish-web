// Writes cfg.design into CSS custom properties — single source of truth for
// every size/duration used by stylesheets. CSS files keep fallback values.
import { cfg } from '../core/config.js';

export function applyTokens(root = document.documentElement) {
  const d = cfg.design;
  const px = (v: number | string) => (typeof v === 'number' ? `${v}px` : v);
  root.style.setProperty('--radius', d.radius);
  root.style.setProperty('--font', d.fontStack);
  root.style.setProperty('--mono', d.monoFontStack);
  root.style.setProperty('--max-content', d.maxContentWidth);
  root.style.setProperty('--icon', px(d.iconSize));
  root.style.setProperty('--w-sidebar', px(d.sidebarWidth));
  root.style.setProperty('--w-list', px(d.sessionListWidth));
  root.style.setProperty('--w-drawer', px(d.drawerWidth));
  root.style.setProperty('--h-topbar', px(d.topbarHeight));
  root.style.setProperty('--h-bottombar', px(d.bottombarHeight));
  for (const [k, v] of Object.entries(d.space)) root.style.setProperty(`--space-${k}`, px(v));
}
