import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function setup() {
  const classes = new Set<string>();
  const widths = new Map<string, string>();
  const saved = new Map<string, string>();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: {
      classList: { add: (value: string) => classes.add(value), remove: (value: string) => classes.delete(value) },
      style: { setProperty: (key: string, value: string) => widths.set(key, value) },
    },
    querySelector: () => ({ getBoundingClientRect: () => ({ width: 350 }) }),
  });
  const window = new EventTarget();
  const target = Object.assign(new EventTarget(), {
    held: false,
    setPointerCapture() { this.held = true; },
    hasPointerCapture() { return this.held; },
    releasePointerCapture(this: EventTarget & { held: boolean }) { this.held = false; this.dispatchEvent(new Event('lostpointercapture')); },
  });
  const code = ts.transpileModule(readFileSync('src/features/sessions/listWidth.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
  const cfg = { design: { sessionListWidthMin: 200, sessionListWidthMax: 600, sessionListWidth: 350 } };
  const result = new Function('cfg', 'tryPlatform', 'document', 'window', 'exports',
    code + '\nreturn { onListResizePointerDown, cancelListResize };')(
    cfg, () => ({ get: (key: string) => saved.get(key), set: (key: string, value: string) => saved.set(key, value) }), document, window, {});
  const start = () => result.onListResizePointerDown({ button: 0, currentTarget: target,
    pointerId: 4, clientX: 400, preventDefault() {} });
  const event = (kind: string, values = {}) => window.dispatchEvent(Object.assign(new Event(kind), { pointerId: 4, clientX: 440, buttons: 1, ...values }));
  return { ...result, document, target, window, classes, widths, saved, start, event };
}

test('lost pointer capture releases resize state and restores scroll interaction', () => {
  const h = setup();
  h.start(); assert.ok(h.classes.has('resizing'));
  h.event('pointermove'); assert.equal(h.widths.get('--w-list'), '390px');
  h.target.held = false;
  h.target.dispatchEvent(new Event('lostpointercapture'));
  assert.equal(h.classes.has('resizing'), false);
  assert.equal(h.widths.get('--w-list'), '350px');
  assert.equal(h.saved.size, 0);
});

test('window blur and page departure cancel a drag; ordinary release saves it', () => {
  const h = setup();
  h.start(); h.window.dispatchEvent(new Event('blur'));
  assert.equal(h.classes.has('resizing'), false);
  h.start(); h.cancelListResize();
  assert.equal(h.classes.has('resizing'), false);
  h.start(); h.event('pointerup');
  assert.equal(h.classes.has('resizing'), false);
  assert.equal(h.saved.get('pref.listWidth'), '390');
});
