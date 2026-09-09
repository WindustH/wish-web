// Single polite aria-live region for one-shot announcements (run finished…).
let region: HTMLElement | null = null;

export function announce(text: string) {
  if (typeof document === 'undefined') return;
  region ??= Object.assign(document.createElement('div'), {
    ariaLive: 'polite', role: 'status',
  });
  region.style.position = 'absolute';
  region.style.width = '1px'; region.style.height = '1px';
  region.style.overflow = 'hidden'; region.style.clip = 'rect(0 0 0 0)';
  if (!region.isConnected) document.body.append(region);
  region.textContent = '';
  requestAnimationFrame(() => { region!.textContent = text; });
}
