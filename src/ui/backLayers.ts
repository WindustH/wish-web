// Local windows share one temporary history entry. Back consumes that entry and closes only
// the top window, so the router and the page underneath never receive that navigation.
export interface BackLayerBrowser {
  history: Pick<History, 'state' | 'pushState' | 'back'>;
  location: { href: string };
  addEventListener(type: 'popstate', listener: (event: PopStateEvent) => void, capture: boolean): void;
}
const MARK = '__wishBackLayer';
type Layer = { close: () => unknown; priority: () => number };

export function createBackLayers(browser: BackLayerBrowser, canArm = () => true) {
  const layers: Layer[] = [];
  let sentinel: { token: string; url: string } | undefined;
  let cleanup: { promise: Promise<void>; resolve: () => void } | undefined;
  let queuedPop: ReturnType<typeof setTimeout> | undefined;
  let navigating: Layer[] | undefined;
  let handling = false;
  let serial = 0;
  let navigation = 0;
  const owner = Math.random().toString(36).slice(2);

  function arm() {
    if (!layers.length || sentinel || cleanup || navigating || handling || !canArm()) return;
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
    const promise = new Promise<void>(done => { resolve = done; });
    cleanup = { promise, resolve };
    // One task's grace: a window dismissed by choosing something in it (the phone's menu, a link
    // inside a card) starts a navigation in the same click. A pop delivered while the router is
    // on its way reads as a rival navigation and the router drops the push - every chat-bar tab
    // went dead behind a menu that had been opened once. A navigation that starts first takes the
    // entry over (beforeNavigation abandons it) and this pop is cancelled.
    queuedPop = setTimeout(() => { queuedPop = undefined; if (cleanup) browser.history.back(); }, 0);
    return promise;
  }
  browser.addEventListener('popstate', event => {
    if (!sentinel || browser.location.href !== sentinel.url || event.state?.[MARK] === sentinel.token) {
      // A settings guard can open a confirmation while a route pop is pending: wait for the
      // router's restoration instead of pushing history over that pending pop. A pop that is not
      // our own entry being consumed - a link, a route change, or the removal below landing on
      // another URL - must also release whoever is waiting on it: a router stopped in
      // beforeNavigation would otherwise stay stopped for good, and every later page dead with it.
      // A sentinel the page has left behind is dropped, so the stack arms again on the new page.
      if (browser.location.href !== sentinel?.url) sentinel = undefined;
      const waiting = cleanup;
      cleanup = undefined;
      waiting?.resolve();
      queueMicrotask(arm);
      return;
    }
    event.stopImmediatePropagation();
    sentinel = undefined;
    handling = true;
    const pending = cleanup;
    cleanup = undefined;
    try {
      if (!pending) {
        const top = layers.reduce<Layer | undefined>((top, layer) => !top || layer.priority() >= top.priority() ? layer : top, undefined);
        top?.close();
      }
    } finally {
      handling = false;
      pending?.resolve();
      arm();
    }
  }, true);

  return {
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
        if (!layers.length) void removeSentinel();
      };
    },
    async beforeNavigation() {
      const ticket = ++navigation;
      navigating ??= [...layers];
      // Never pop history while the router is on its way: a popstate arriving mid-navigation reads
      // as a rival navigation and the router drops the push, which left every tab of the phone's
      // chat bar dead once a menu had been opened and closed. The sentinel entry is abandoned
      // instead - one identical stop in history - and the stack re-arms on arrival.
      if (queuedPop !== undefined) { clearTimeout(queuedPop); queuedPop = undefined; }
      const waiting = cleanup;
      cleanup = undefined;
      waiting?.resolve();
      sentinel = undefined;
      return ticket;
    },
    afterNavigation(succeeded: boolean, ticket = navigation, preserve = false) {
      if (!navigating || ticket !== navigation) return;
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
      arm();
    },
  };
}

export type BackLayers = ReturnType<typeof createBackLayers>;
let shared: BackLayers | undefined;
export const setBackLayers = (value: BackLayers) => { shared = value; };
export const backLayers = () => shared;
