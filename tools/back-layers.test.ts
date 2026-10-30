import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackLayers, type BackLayerBrowser } from '../src/ui/backLayers.ts';

function harness(canArm = () => true) {
  const pages = [
    { url: 'https://wish.test/#/sessions', state: { position: 0, current: '/sessions', back: null } },
    { url: 'https://wish.test/#/s/1', state: { position: 1, current: '/s/1', back: '/sessions', scroll: { top: 431 } } },
  ];
  let index = 1;
  let pushes = 0;
  let activated = true;
  let skippable = false;
  const listeners: { fn: (event: PopStateEvent) => void; capture: boolean }[] = [];
  const pending: (() => void)[] = [];
  const routed: string[] = [];
  const browser: BackLayerBrowser = {
    location: { get href() { return pages[index]!.url; } },
    history: {
      get state() { return pages[index]!.state; },
      pushState(state, _title, url) {
        pushes++;
        if (!activated) skippable = true;
        pages.splice(index + 1);
        pages.push({ state, url: String(url) });
        index++;
      },
      replaceState(state, _title, url) { pages[index] = { state, url: String(url) }; },
      back() { traverse(-1); },
      forward() { traverse(1); },
    },
    addEventListener(_type, fn, capture) { listeners.push({ fn, capture }); },
  };
  function traverse(delta: number) { pending.push(() => {
        if (index + delta < 0 || index + delta >= pages.length) return;
        index += delta;
        activated = false;
        let stopped = false;
        const event = { state: pages[index]!.state, stopImmediatePropagation() { stopped = true; } } as PopStateEvent;
        for (const listener of listeners) {
          listener.fn(event);
          if (stopped) break;
        }
      }); }
  // popstate targets Window: capture does not make a later listener precede an earlier one.
  const stack = createBackLayers(browser, canArm);
  browser.addEventListener('popstate', () => { routed.push(browser.location.href); }, false);
  const flushOne = () => pending.shift()?.();
  const flush = () => { for (let n = 0; pending.length; n++) { if(n > 100) throw Error('history traversal loop'); flushOne(); } };
  const back = () => { browser.history.back(); flush(); };
  // The sentinel a dismissed window pushed is popped one task later, so a navigation starting in
  // the same click can take that entry over instead of being cancelled by a rival popstate.
  const tick = async () => { await new Promise(done => setTimeout(done, 0)); flush(); };
  return { stack, browser, pages, routed, flush, flushOne, back, tick,
    get pushes() { return pushes; },
    nativeBack() { if (skippable) routed.push('outside Wish'); else back(); },
    get index() { return index; } };
}

test('Back closes the viewer, preserves the page and router state; the next Back navigates', () => {
  const h = harness();
  const original = h.browser.history.state;
  let release = () => {};
  release = h.stack.add(() => release(), () => 200);
  h.back();
  assert.equal(h.browser.location.href, 'https://wish.test/#/s/1');
  assert.deepEqual(h.browser.history.state, original);
  assert.deepEqual(h.routed, [], 'the page router never handles the viewer dismissal');
  h.back();
  assert.deepEqual(h.routed, ['https://wish.test/#/sessions']);
});

test('Back closes only the top visual layer, then the layer beneath, then the page', () => {
  const h = harness();
  const closed: string[] = [];
  let parent = () => {}, viewer = () => {}, menu = () => {};
  parent = h.stack.add(() => { closed.push('parent'); parent(); }, () => 60);
  viewer = h.stack.add(() => { closed.push('viewer'); viewer(); }, () => 200);
  menu = h.stack.add(() => { closed.push('menu'); menu(); }, () => 70);
  for (const expected of ['viewer', 'menu', 'parent']) {
    h.back();
    assert.equal(closed.at(-1), expected);
    assert.equal(h.browser.location.href, 'https://wish.test/#/s/1');
    assert.equal(h.routed.length, 0);
  }
  h.back();
  assert.equal(h.routed.length, 1);
});

test('equally high windows close in reverse opening order', () => {
  const h = harness();
  const closed: number[] = [];
  const releases = [1, 2].map(n => {
    const release = h.stack.add(() => { closed.push(n); release(); });
    return release;
  });
  h.back(); h.back();
  assert.deepEqual(closed, [2, 1]);
  releases.forEach(release => release());
});

test('manual dismissal leaves no extra Back stop and reopening during cleanup is safe', async () => {
  const h = harness();
  const first = h.stack.add(() => {});
  first();
  let closed = false;
  const second = h.stack.add(() => { closed = true; second(); });
  h.flush();
  assert.equal(closed, false, 'finishing the first close cannot dismiss the newly opened window');
  h.back();
  assert.equal(closed, true);
  await h.tick();
  h.back();
  assert.deepEqual(h.routed, ['https://wish.test/#/sessions']);
});

test('busy windows and asynchronous closing keep Back away from the background page', async () => {
  const h = harness();
  let attempts = 0;
  const release = h.stack.add(() => { attempts++; });
  h.back(); h.back();
  assert.equal(attempts, 2);
  assert.equal(h.routed.length, 0);
  release(); // a close animation or confirmation finally completes
  await h.tick();
  h.back();
  assert.deepEqual(h.routed, ['https://wish.test/#/sessions']);
});

test('a link chosen in a window waits for history cleanup and keeps the destination in history', async () => {
  const h = harness();
  let closed = false;
  const release = h.stack.add(() => { closed = true; release(); });
  const pending = h.stack.beforeNavigation();
  h.flush();
  await pending;
  h.browser.history.pushState({ position: 2 }, '', 'https://wish.test/#/settings');
  h.stack.afterNavigation(true);
  assert.equal(closed, true);
  h.flush();
  assert.equal(h.browser.location.href, 'https://wish.test/#/settings');
  h.back();
  assert.equal(h.browser.location.href, 'https://wish.test/#/s/1');
  assert.equal(h.routed.length, 1);
});

test('cancelled route navigation restores the local window Back behavior', async () => {
  const h = harness();
  let closed = false;
  const release = h.stack.add(() => { closed = true; release(); });
  const pending = h.stack.beforeNavigation();
  h.flush(); await pending;
  h.stack.afterNavigation(false);
  assert.equal(closed, false);
  h.back();
  assert.equal(closed, true);
  assert.equal(h.routed.length, 0);
});

test('an older cancelled navigation cannot rearm history over a newer destination', async () => {
  const h = harness();
  let closed = false;
  const release = h.stack.add(() => { closed = true; release(); });
  const first = h.stack.beforeNavigation();
  const second = h.stack.beforeNavigation();
  h.flush();
  const [oldTicket, currentTicket] = await Promise.all([first, second]);
  // The sentinel entry the window pushed is abandoned rather than popped: popping it while the
  // router is on its way reads as a rival navigation and the router drops the push (the phone's
  // chat-bar tabs went dead behind an opened menu). What matters is that no *further* entry is
  // pushed - the stack must not build history under a navigation that is still in flight.
  const armed = h.index;
  h.stack.afterNavigation(false, oldTicket);
  assert.equal(h.index, armed, 'a superseded cancellation must not push another local history entry');
  h.browser.history.pushState({ position: 2 }, '', 'https://wish.test/#/settings');
  h.stack.afterNavigation(true, currentTicket);
  assert.equal(closed, true);
  h.back();
  assert.equal(h.browser.location.href, 'https://wish.test/#/s/1');
  assert.equal(h.routed.length, 1);
});

test('turning a routed mobile panel into a desktop window preserves the window', async () => {
  const h = harness();
  let closed = false;
  const release = h.stack.add(() => { closed = true; release(); });
  const pending = h.stack.beforeNavigation();
  h.flush();
  const ticket = await pending;
  h.stack.afterNavigation(true, ticket, true);
  assert.equal(closed, false, 'normalizing the URL on resize does not dismiss the panel');
  h.back();
  assert.equal(closed, true, 'Back still closes the local desktop window');
  assert.equal(h.routed.length, 0);
});

test('a window opened by a pending route guard cannot push history over the pending navigation', async () => {
  let ready = false;
  const h = harness(() => ready);
  let release = () => {};
  release = h.stack.add(() => release());
  assert.equal(h.index, 1);
  ready = true;
  const pending = h.stack.beforeNavigation();
  await pending;
  h.stack.afterNavigation(false);
  assert.equal(h.index, 2);
  h.back();
  assert.equal(h.routed.length, 0);
});

test('mobile page boundary survives closing a detail and handles only the next Back', async () => {
  const h = harness();
  let pageReturns = 0;
  h.stack.setPageBack(() => { pageReturns++; });
  let release = () => {};
  release = h.stack.add(() => release());
  h.back();
  assert.equal(pageReturns, 0);
  await h.tick();
  h.back();
  assert.equal(pageReturns, 1);
  assert.equal(h.routed.length, 0);
  const ticket = await h.stack.beforeNavigation();
  h.stack.afterNavigation(true, ticket);
  assert.equal(pageReturns, 1, 'route completion never invokes the page Back handler');
  h.back();
  assert.equal(pageReturns, 2);
  const releasing = h.stack.releasePageBoundary();
  await h.tick();
  await releasing;
  h.back();
  assert.equal(h.routed.length, 1, 'explicit exit releases the browser boundary');
});


test('consecutive native Back traversals reuse a boundary instead of marking history skippable', async () => {
  const h = harness();
  let pagesClosed = 0;
  h.stack.setPageBack(() => { pagesClosed++; });
  const pushes = h.pushes;
  let release = () => {};
  release = h.stack.add(() => release());
  h.nativeBack();
  assert.equal(pagesClosed, 0);
  h.nativeBack();
  assert.equal(pagesClosed, 1);
  // A logical parent replaces the current boundary entry rather than pushing one after Back.
  const ticket = await h.stack.beforeNavigation();
  h.pages[h.index]!.url = 'https://wish.test/#/settings';
  h.stack.afterNavigation(true, ticket);
  h.nativeBack();
  assert.equal(pagesClosed, 2);
  assert.equal(h.pushes, pushes, 'no pushState after a traversal without fresh activation');
  assert.deepEqual(h.routed, [], 'Chrome must not skip to a page outside Wish');
});


test('removing a replaced page boundary preserves the route visible to the router', async () => {
  const h = harness();
  h.stack.setPageBack(() => {});
  const ticket = await h.stack.beforeNavigation();
  h.pages[h.index]!.url = 'https://wish.test/#/settings';
  h.stack.afterNavigation(true, ticket);
  const released = h.stack.releasePageBoundary();
  await h.tick();
  await released;
  assert.equal(h.browser.location.href, 'https://wish.test/#/settings');
  assert.deepEqual(h.routed, []);
});

test('overlapping Back traversals preserve the promise awaited by a concurrent route navigation', async () => {
  const h = harness();
  let closed = 0;
  const release = h.stack.add(() => { closed++; release(); });
  h.browser.history.back();
  h.browser.history.back();
  h.flushOne();
  let navigated = false;
  const navigation = h.stack.beforeNavigation().then(ticket => { navigated = true; return ticket; });
  h.flush();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(navigated, true, 'the first restoration waiter must not be orphaned by a second pop');
  assert.equal(closed, 1);
  h.stack.afterNavigation(false, await navigation);
});
