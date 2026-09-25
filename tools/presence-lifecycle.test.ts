import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, h, nextTick, ref, type Ref } from 'vue';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const presencePath = require.resolve('reka-ui').replace(/index\.cjs$/, 'Presence/usePresence.js');
const { usePresence } = await import(pathToFileURL(presencePath).href);

function harness() {
  const previousStyle = globalThis.getComputedStyle;
  const previousCss = globalThis.CSS;
  const style = { animationName: 'enter', animationDuration: '0.12s', animationDelay: '0s', display: 'block' };
  globalThis.getComputedStyle = () => style as unknown as CSSStyleDeclaration;
  globalThis.CSS = { escape: (value: string) => value } as unknown as typeof CSS;
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const clock = {
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const node = {
    ownerDocument: { defaultView: clock },
    style: { animationFillMode: '' },
    addEventListener(name: string, callback: (event: { target: unknown }) => void) { listeners.set(name, callback); },
    removeEventListener(name: string) { listeners.delete(name); },
    dispatchEvent() {},
  };
  const renderer = createRenderer({
    patchProp() {},
    insert(child, parent) { parent.children ||= []; parent.children.push(child); },
    remove() {},
    createElement() { return { children: [] }; },
    createText(text) { return { text }; },
    createComment(text) { return { text }; },
    setText(node, text) { node.text = text; },
    setElementText(node, text) { node.text = text; },
    parentNode() { return null; },
    nextSibling() { return null; },
  });
  let present!: Ref<boolean>, presence!: { isPresent: Ref<boolean> }, nodeRef!: Ref<unknown>;
  const app = renderer.createApp({
    setup() {
      present = ref(true);
      nodeRef = ref(node);
      presence = usePresence(present, nodeRef);
      return () => h('div');
    },
  });
  app.mount({ children: [] });
  return {
    present, presence, nodeRef, style, listeners, timers,
    runTimers() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
    cleanup() { app.unmount(); globalThis.getComputedStyle = previousStyle; globalThis.CSS = previousCss; },
  };
}

async function settle() { await nextTick(); await nextTick(); }

test('a skipped exit animation still releases Presence and its modal layer', async () => {
  const ui = harness();
  try {
    ui.listeners.get('animationstart')({ target: ui.nodeRef.value });
    ui.style.animationName = 'leave';
    ui.present.value = false;
    await settle();
    assert.equal(ui.presence.isPresent.value, true);
    assert.equal(ui.timers.size, 1);
    ui.runTimers();
    assert.equal(ui.presence.isPresent.value, false);
  } finally { ui.cleanup(); }
});

test('reopening before exit finishes cancels the stale unmount', async () => {
  const ui = harness();
  try {
    ui.listeners.get('animationstart')({ target: ui.nodeRef.value });
    ui.style.animationName = 'leave';
    ui.present.value = false;
    await settle();
    assert.equal(ui.timers.size, 1);
    ui.style.animationName = 'enter';
    ui.present.value = true;
    await settle();
    assert.equal(ui.timers.size, 0);
    assert.equal(ui.presence.isPresent.value, true);
  } finally { ui.cleanup(); }
});
