// Local windows and mobile pages share a reusable history boundary. A Back traversal
// restores that boundary before dismissing its top layer, without pushing another entry.
export interface BackLayerBrowser {
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'back' | 'forward'>;
  location: { href: string };
  addEventListener(type: 'popstate', listener: (event: PopStateEvent) => void, capture: boolean): void;
}
const MARK = '__wishBackLayer';
type Layer = { close: () => unknown; priority: () => number };

export function createBackLayers(browser: BackLayerBrowser, canArm = () => true) {
  const layers: Layer[] = [];
  let pageBack: (() => unknown) | undefined;
  let sentinel: { token: string; url: string } | undefined;
  let cleanup: { promise: Promise<void>; resolve: () => void; url: string; state: Record<string, unknown> } | undefined;
  let queuedPop: ReturnType<typeof setTimeout> | undefined;
  let navigating: Layer[] | undefined;
  let handling = false;
  let restoring: (() => void) | undefined;
  let restorationFinished: Promise<void> | undefined;
  let finishRestoration: (() => void) | undefined;
  let navigationSentinel: typeof sentinel;
  let serial = 0;
  let navigation = 0;
  const owner = Math.random().toString(36).slice(2);

  function arm() {
    if ((!layers.length && !pageBack) || sentinel || cleanup || navigating || handling || !canArm()) return;
    const token = `${owner}:${++serial}`;
    const url = browser.location.href;
    // Preserve every router field, including its position and scroll restoration state. The
    // router does not own this entry: its pop is stopped in capture before its listener runs.
    browser.history.pushState({ ...browser.history.state, [MARK]: token }, '', url);
    sentinel = { token, url };
  }
  function removeSentinel(): Promise<void> {
    if (cleanup) return cleanup.promise;
    if (!sentinel) return Promise.resolve();
    if (browser.location.href !== sentinel.url || browser.history.state?.[MARK] !== sentinel.token) {
      sentinel = undefined;
      return Promise.resolve();
    }
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const state = { ...browser.history.state };
    delete state[MARK];
    cleanup = { promise, resolve, url: browser.location.href, state };
    // One task's grace: a window dismissed by choosing something in it (the phone's menu, a link
    // inside a card) starts a navigation in the same click. A pop delivered while the router is
    // on its way reads as a rival navigation and the router drops the push - every chat-bar tab
    // went dead behind a menu that had been opened once. A navigation that starts first takes the
    // entry over (beforeNavigation abandons it) and this pop is cancelled.
    if (handling) browser.history.back();
    else
      queuedPop = setTimeout(() => {
        queuedPop = undefined;
        if (cleanup) browser.history.back();
      }, 0);
    return promise;
  }
  browser.addEventListener(
    'popstate',
    (event) => {
      if (restoring && event.state?.[MARK] === sentinel?.token) {
        event.stopImmediatePropagation();
        const action = restoring;
        restoring = undefined;
        handling = true;
        try {
          action();
        } finally {
          handling = false;
          finishRestoration?.();
          finishRestoration = undefined;
          restorationFinished = undefined;
        }
        return;
      }
      if (!sentinel || event.state?.[MARK] === sentinel.token) {
        const waiting = cleanup;
        cleanup = undefined;
        waiting?.resolve();
        return;
      }
      event.stopImmediatePropagation();
      const pending = cleanup;
      cleanup = undefined;
      if (pending) {
        // A parent-route replacement can leave the boundary over an older URL. Removing
        // it must keep the visible route (including when resizing back to desktop).
        if (browser.location.href !== pending.url) browser.history.replaceState(pending.state, '', pending.url);
        sentinel = undefined;
        pending.resolve();
        arm();
        return;
      }
      // Reuse the boundary already in forward history. Pushing a replacement after a Back
      // makes Chromium mark all this document's entries skippable by its native Back UI.
      // Restore before invoking the handler, so route replacements cannot race the traversal.
      const top = layers.reduce<Layer | undefined>(
        (top, layer) => (!top || layer.priority() >= top.priority() ? layer : top),
        undefined,
      );
      restoring = () => {
        if (top) {
          if (layers.includes(top)) top.close();
        } else if (!layers.length) pageBack?.();
      };
      restorationFinished = new Promise<void>((resolve) => {
        finishRestoration = resolve;
      });
      browser.history.forward();
    },
    true,
  );

  return {
    // The page boundary uses the same history entry as local dialogs. It is not a dialog:
    // route changes must not invoke it as part of dismissing the previous page's windows.
    setPageBack(handler: (() => unknown) | undefined) {
      pageBack = handler;
      if (handler) arm();
      else if (!layers.length) void removeSentinel();
    },
    async releasePageBoundary() {
      pageBack = undefined;
      const hadBoundary = !!sentinel;
      await removeSentinel();
      return hadBoundary;
    },
    add(close: () => unknown, priority: () => number = () => 60) {
      // A window opening before a dismissal's pop has gone out keeps the entry the stack is on:
      // the sentinel is still wanted, so the queued removal is called off.
      if (queuedPop !== undefined) {
        clearTimeout(queuedPop);
        queuedPop = undefined;
        const waiting = cleanup;
        cleanup = undefined;
        waiting?.resolve();
      }
      const layer = { close, priority };
      layers.push(layer);
      arm();
      return () => {
        const index = layers.indexOf(layer);
        if (index < 0) return;
        layers.splice(index, 1);
        if (!layers.length && !pageBack) void removeSentinel();
      };
    },
    async beforeNavigation() {
      if (restorationFinished) await restorationFinished;
      const ticket = ++navigation;
      navigating ??= [...layers];
      // Do not traverse while the router is navigating. A replacement retains the current
      // boundary token; a push creates a new route entry. afterNavigation distinguishes them
      // so replacements after native Back never push an extra entry without activation.
      if (queuedPop !== undefined) {
        clearTimeout(queuedPop);
        queuedPop = undefined;
      }
      const waiting = cleanup;
      cleanup = undefined;
      waiting?.resolve();
      navigationSentinel ??= sentinel;
      sentinel = undefined;
      return ticket;
    },
    afterNavigation(succeeded: boolean, ticket = navigation, preserve = false) {
      if (!navigating || ticket !== navigation) return;
      if (navigationSentinel && browser.history.state?.[MARK] === navigationSentinel.token) {
        sentinel = { ...navigationSentinel, url: browser.location.href };
      }
      navigationSentinel = undefined;
      const previous = navigating;
      if (succeeded && !preserve) {
        // A link deliberately chosen inside a window can still navigate. Do not leave its
        // local window or an extra history stop behind on the destination page.
        for (const layer of previous.reverse()) {
          const index = layers.indexOf(layer);
          if (index < 0) continue;
          layers.splice(index, 1);
          layer.close();
        }
      }
      navigating = undefined;
      if (!layers.length && !pageBack) sentinel = undefined;
      arm();
    },
  };
}

export type BackLayers = ReturnType<typeof createBackLayers>;
let shared: BackLayers | undefined;
export const setBackLayers = (value: BackLayers) => {
  shared = value;
};
export const backLayers = () => shared;
