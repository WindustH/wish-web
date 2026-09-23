import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function setup() {
  const classes = new Set();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } },
  });
  const window = new EventTarget();
  const target = Object.assign(new EventTarget(), {
    held: false,
    setPointerCapture() { this.held = true; },
    hasPointerCapture() { return this.held; },
    releasePointerCapture() { this.held = false; this.dispatchEvent(new Event('lostpointercapture')); },
  });
  let dispose;
  const source = ts.transpileModule(readFileSync('src/features/sessions/useComposerDrag.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
  const { useComposerDrag } = new Function('onScopeDispose', 'cfg', 'document', 'window',
    source + '\nreturn { useComposerDrag };')(
    fn => { dispose = fn; }, { composer: { resizeStep: 20 } }, document, window);
  const committed = [];
  const sizing = { min: () => 100, max: () => 500, change() {}, commit: value => committed.push(value) };
  const drag = useComposerDrag(sizing, { value: 200 });
  const start = () => drag.startComposerDrag({ button: 0, currentTarget: target,
    pointerId: 7, clientY: 400, preventDefault() {} });
  return { document, window, target, classes, committed, start, dispose: () => dispose() };
}

test('lost pointer capture and component disposal clear global resize state', () => {
  const h = setup();
  h.start(); assert.ok(h.classes.has('resizing-composer'));
  h.target.held = false; h.target.dispatchEvent(new Event('lostpointercapture'));
  assert.equal(h.classes.has('resizing-composer'), false);
  assert.deepEqual(h.committed, [200]);
  h.start(); h.dispose();
  assert.equal(h.classes.has('resizing-composer'), false);
  assert.deepEqual(h.committed, [200, 200]);
});

test('window blur cancels an in-progress composer resize', () => {
  const h = setup();
  h.start(); h.window.dispatchEvent(new Event('blur'));
  assert.equal(h.classes.has('resizing-composer'), false);
  assert.deepEqual(h.committed, [200]);
});
