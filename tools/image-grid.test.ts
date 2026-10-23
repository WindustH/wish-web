import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse, compileScript } from 'vue/compiler-sfc';
import ts from 'typescript';

// Render the real grid and its three consumers, without needing a browser or opening Reka's
// portals. The modal stand-in marks its slot so inline and popup pictures can be counted apart.
const standIns: Record<string, unknown> = {
  'Modal.vue': defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('section', { 'data-popup': '' }, slots.default?.()) : null }),
  'UserBubble.vue': defineComponent({ props: ['block'], setup: () => () => h('img', { alt: '' }) }),
  'ApiImage.vue': defineComponent({ props: ['src'], setup: () => () => h('img', { alt: '' }) }),
  'HistoryChips.vue': defineComponent({ setup: () => () => null }),
  'MessageContext.vue': defineComponent({ inheritAttrs: false, setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  'Markdown.vue': defineComponent({ setup: () => () => null }),
  'Icon.vue': defineComponent({ setup: () => () => h('span') }),
  'ProcessDetail.vue': defineComponent({ setup: () => () => null }),
};
const originalMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
before(() => Object.defineProperty(globalThis, 'matchMedia', { configurable: true,
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }));
after(() => {
  if (originalMedia) Object.defineProperty(globalThis, 'matchMedia', originalMedia);
  else Reflect.deleteProperty(globalThis, 'matchMedia');
});
const cache = new Map<string, ReturnType<typeof defineComponent>>();
function component(name: string): ReturnType<typeof defineComponent> {
  const file = name.startsWith('/') ? name : fileURLToPath(new URL(`../src/features/sessions/entries/${name}`, import.meta.url));
  const cached = cache.get(file);
  if (cached) return cached;
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
  const script = compileScript(descriptor, { id: 'image-grid-test', inlineTemplate: true, templateOptions: { ssr: true } });
  const js = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = createRequire(file);
  const exports: { default?: ReturnType<typeof defineComponent> } = {};
  new Function('require', 'exports', js)((path: string) => {
    const basename = path.split('/').at(-1)!;
    if (standIns[basename]) return { default: standIns[basename] };
    return path.endsWith('.vue') ? { default: component(localRequire.resolve(path)) } : localRequire(path);
  }, exports);
  cache.set(file, exports.default!);
  return exports.default!;
}

const pictures = (count: number) => Array.from({ length: count }, (_, i) => ({ type: 'image', mime_type: 'image/png', data_base64: String(i) }));
const imageCount = (html: string) => (html.match(/<img\b/g) ?? []).length;

test('all image entry renderers show at most eight thumbnails and a remaining count above nine', async () => {
  const blocks = pictures(114);
  const entry = { key: 's1t0', type: 'entry', entry: { kind: 'user_message', seq: 1, payload: { content: blocks } }, blocks, usage: null };
  const views = [
    ['UserEntry.vue', { content: blocks }],
    ['AssistantEntry.vue', { item: { ...entry, entry: { ...entry.entry, kind: 'assistant_message' } } }],
    ['ImageAlbumEntry.vue', { item: { type: 'image_album', key: entry.key, items: [entry] } }],
  ] as const;
  for (const [name, props] of views) {
    const html = await renderToString(createSSRApp(component(name), props));
    assert.equal(imageCount(html), 8, name);
    assert.match(html, /\+106/, name);
    assert.ok(!html.includes('data-popup'), 'the popup starts closed');
  }
});

test('exactly nine images all remain visible, and the tenth replaces cell nine with +2', async () => {
  const nine = await renderToString(createSSRApp(component('UserEntry.vue'), { content: pictures(9) }));
  const ten = await renderToString(createSSRApp(component('UserEntry.vue'), { content: pictures(10) }));
  assert.equal(imageCount(nine), 9);
  assert.ok(!nine.includes('image-grid-more'));
  assert.equal(imageCount(ten), 8);
  assert.match(ten, /\+2/);
});

test('opening a large album renders a bounded window while its inline preview stays compact', async () => {
  const blocks = pictures(114);
  const item = { key: 's1t0', type: 'entry', entry: { kind: 'assistant_message', seq: 1 }, blocks, usage: null };
  const html = await renderToString(createSSRApp(component('AssistantEntry.vue'), { item, forcedKeys: new Set([item.key]) }));
  const [inline, popup] = html.split(/<section\b[^>]*data-popup[^>]*>/);
  assert.ok(popup, 'the grid opens the modal when locating an image hidden in the preview');
  assert.equal(imageCount(inline!), 8);
  assert.ok(imageCount(popup!) > 0 && imageCount(popup!) < 50, 'only visible rows and their small overscan are mounted');
  assert.ok(popup!.includes('aria-setsize="23"'), 'the scrollable grid still covers all 114 images in 23 rows');
});

test('search can open the far end of a virtualized album directly', async () => {
  const blocks = pictures(1000);
  const item = { key: 's1t0', type: 'entry', entry: { kind: 'assistant_message', seq: 1 }, blocks, usage: null,
    imageSeqs: blocks.map((_, i) => i + 100) };
  const html = await renderToString(createSSRApp(component('AssistantEntry.vue'), { item, forcedKeys: new Set([item.key]), locateSeq: 1099 }));
  const popup = html.split(/<section\b[^>]*data-popup[^>]*>/)[1]!;
  assert.match(popup, /data-seq="1099"/);
  assert.ok(imageCount(popup) < 50);
});

test('a five-thousand-step tool window only mounts visible event controls and can locate a late result', async () => {
  const steps = Array.from({ length: 5000 }, (_, i) => ({ kind: 'block', key: `b${i}`, fromSeq: i,
    block: { type: 'tool_call', id: `c${i}`, name: 'shell_start', arguments: { command: `command ${i}` } } }));
  const html = await renderToString(createSSRApp(component('ProcessGroup.vue'), {
    item: { type: 'process', key: 'p', steps }, forced: true, targetSeq: 4987, variant: 'ghost',
  }));
  assert.match(html, /data-seq="4987"/);
  const mounted = (html.match(/class="proc-event-button/g) ?? []).length;
  assert.ok(mounted > 0 && mounted <= 13, `mounted ${mounted} rows rather than 5000`);
  assert.match(html, /aria-setsize="5000"/);
});

test('a closed rail with a thousand groups creates no window hosts', async () => {
  const chips = Array.from({ length: 1000 }, (_, i) => ({ type: 'process', key: `p${i}`, steps: [] }));
  const html = await renderToString(createSSRApp(component('HistoryChips.vue'), { chips }));
  assert.ok(!html.includes('history-chip-host'));
});
