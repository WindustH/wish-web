import { watch } from 'vue';
import type { Router } from 'vue-router';
import { activityEnabled, flushActivity, recordActivity } from './activityStore.ts';

// Record structure and timing only; never input values, text nodes, request bodies or headers.
function targetName(target: EventTarget | null): string {
  if (!(target instanceof Element)) return target === window ? 'window' : 'document';
  return [target, target.parentElement, target.parentElement?.parentElement].filter(Boolean)
    .map(node => `${node!.tagName.toLowerCase()}${[...node!.classList].slice(0, 3).map(c => '.' + c).join('')}`).join(' < ');
}
function safeUrl(value: string) {
  try { const url = new URL(value, location.href); return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin + url.pathname : url.protocol; }
  catch { return 'invalid-url'; }
}
function errorInfo(error: unknown) {
  // Error messages can contain server response bodies or submitted content. Keep type and frames.
  return error instanceof Error ? { name: error.name, frames: error.stack?.split('\n').slice(1, 7).map(frame => frame.replace(/https?:\/\/[^\s)]+/g, safeUrl)) } : { type: typeof error };
}
function pageState() {
  return { visibility: document.visibilityState, pointerEvents: getComputedStyle(document.body).pointerEvents,
    overflow: getComputedStyle(document.body).overflow, focus: targetName(document.activeElement),
    layers: [...document.querySelectorAll('[inert], [role="dialog"], .modal-overlay, .menu-backdrop')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').slice(0, 12)
      .map(el => ({ target: targetName(el), inert: el.hasAttribute('inert') })),
    viewport: { width: innerWidth, height: innerHeight, scale: visualViewport?.scale } };
}
export function installActivityRecorder(router: Router) {
  return watch(activityEnabled, (enabled, _, cleanup) => {
    if (!enabled) return;
    let active = true;
    const releases: (() => void)[] = [];
    const listen = (target: EventTarget, type: string, handler: (event: any) => void, capture = true) => {
      target.addEventListener(type, handler, { capture, passive: true });
      releases.push(() => target.removeEventListener(type, handler, capture));
    };
    recordActivity('recording.started', { ...pageState(), online: navigator.onLine });
    flushActivity();
    const throttles = new Map<string, number>();
    function interaction(event: Event) {
      const target = targetName(event.target);
      if (['scroll', 'input', 'pointermove', 'wheel'].includes(event.type)) {
        if (performance.now() - (throttles.get(event.type) ?? -Infinity) < 250) return;
        throttles.set(event.type, performance.now());
      }
      const detail: Record<string, unknown> = { target };
      if (event instanceof PointerEvent) Object.assign(detail, { pointer: event.pointerType, x: Math.round(event.clientX), y: Math.round(event.clientY) });
      if (event instanceof KeyboardEvent) {
        // Printable characters, including shortcuts in password fields, are never captured.
        if (event.key.length === 1) return;
        if (!['Escape','Enter','Tab','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)) return;
        Object.assign(detail, { key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey });
      }
      if (event instanceof InputEvent) detail.inputType = event.inputType;
      if (event.type === 'scroll' && event.target instanceof Element) Object.assign(detail, { top: event.target.scrollTop, height: event.target.scrollHeight, viewport: event.target.clientHeight });
      recordActivity(event.type, detail);
      if (['pointerup','touchend','click'].includes(event.type)) {
        queueMicrotask(() => { if (active) recordActivity(event.type + '.finished', { target, cancelled: event.defaultPrevented, connected: event.target instanceof Node && event.target.isConnected, ...pageState() }); });
      }
    }
    for (const type of ['pointerdown','pointerup','pointercancel','pointermove','touchstart','touchend','touchcancel','click','contextmenu','keydown','input','focusin','focusout','scroll','wheel','submit']) listen(window, type, interaction);
    for (const type of ['popstate','hashchange','pageshow','pagehide','online','offline','resize']) listen(window, type, () => { recordActivity(type, pageState()); flushActivity(); });
    listen(document, 'visibilitychange', () => { recordActivity('visibilitychange', pageState()); flushActivity(); });
    listen(window, 'error', (event: Event) => {
      if (event instanceof ErrorEvent) recordActivity('runtime.error', { ...errorInfo(event.error), file: safeUrl(event.filename), line: event.lineno, column: event.colno });
      else recordActivity('resource.error', { target: targetName(event.target), url: event.target instanceof HTMLImageElement ? safeUrl(event.target.currentSrc || event.target.src) : undefined });
      flushActivity();
    });
    listen(window, 'unhandledrejection', (event: PromiseRejectionEvent) => { recordActivity('runtime.rejection', errorInfo(event.reason)); flushActivity(); });
    listen(document, 'load', (event: Event) => { if (event.target instanceof HTMLImageElement) recordActivity('image.loaded', { url: safeUrl(event.target.currentSrc), width: event.target.naturalWidth, height: event.target.naturalHeight }); });
    releases.push(router.beforeEach((to, from) => { recordActivity('navigation.start', { from: from.path, to: to.path }); }));
    releases.push(router.afterEach((to, from, failure) => { recordActivity('navigation.finish', { from: from.path, to: to.path, failed: !!failure, ...pageState() }); flushActivity(); }));
    releases.push(router.onError(error => { recordActivity('navigation.error', errorInfo(error)); flushActivity(); }));
    const originalFetch = window.fetch;
    let requestId = 0;
    const observedFetch: typeof fetch = async (input, init) => {
      const id = ++requestId, started = performance.now();
      recordActivity('request.start', { id, method: init?.method ?? (input instanceof Request ? input.method : 'GET'), url: safeUrl(input instanceof Request ? input.url : String(input)) });
      try {
        const response = await originalFetch.call(window, input, init);
        if (active) recordActivity('request.headers', { id, status: response.status, durationMs: Math.round(performance.now() - started) });
        return response;
      } catch (error) {
        if (active) recordActivity('request.failed', { id, durationMs: Math.round(performance.now() - started), ...errorInfo(error) });
        throw error;
      }
    };
    window.fetch = observedFetch;
    releases.push(() => { if (window.fetch === observedFetch) window.fetch = originalFetch; });
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) recordActivity('main-thread.longtask', { durationMs: Math.round(entry.duration), startMs: Math.round(entry.startTime) }); });
      observer.observe({ type: 'longtask' }); releases.push(() => observer.disconnect());
    }
    let lastBeat = performance.now();
    const beat = setInterval(() => {
      const now = performance.now();
      if (now - lastBeat > 2000) recordActivity('main-thread.delay', { durationMs: Math.round(now - lastBeat), ...pageState() });
      lastBeat = now;
    }, 1000);
    releases.push(() => clearInterval(beat));
    cleanup(() => { active = false; releases.forEach(release => release()); flushActivity(); });
  }, { immediate: true, flush: 'sync' });
}
