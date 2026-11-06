import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRenderer, proxyRefs, type SetupContext } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import ts from 'typescript';

// Execute the actual component setup without a browser or a decoder. Media seeks
// update currentTime synchronously but deliver timeupdate/seeked in later tasks.
const source = await readFile(new URL('../src/domain/media/VideoPlayer.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'video-seek-regression' })
  .content.replaceAll("from 'vue'", `from ${JSON.stringify(import.meta.resolve('vue'))}`)
  .replace("import Icon from '../../ui/components/Icon.vue';", 'const Icon = {};')
  .replace("import { tr } from '../../core/i18n/tr.ts';", 'const tr = (zh, en) => en;');
const code = ts.transpileModule(script, {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
const { default: component } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  patchProp() {},
  parentNode: () => null,
  nextSibling: () => null,
});

function player() {
  let state!: {
    video: unknown;
    draft: number | null;
    shownTime: number;
    progress: number;
    sync(): void;
    seek(event: { target: { value: string } }): void;
    keyboard(event: { key: string; target: { closest(): null }; preventDefault(): void }): void;
  };
  const app = renderer.createApp(
    {
      ...component,
      setup(props: Record<string, unknown>, context: SetupContext) {
        state = proxyRefs(component.setup(props, context));
        return () => null;
      },
    },
    { src: 'test.webm', label: 'Video' },
  );
  app.mount({});
  const media = {
    currentTime: 10,
    duration: 120,
    paused: true,
    volume: 1,
    muted: false,
    playbackRate: 1,
    buffered: { length: 0 },
    pause() {},
  };
  state.video = media;
  state.sync();
  return { state, media, dispose: () => app.unmount() };
}

test('releasing a video seek keeps the requested position before media events arrive', (t) => {
  const { state, media, dispose } = player();
  t.after(dispose);
  state.draft = 90;
  assert.equal(state.shownTime, 90);
  state.seek({ target: { value: '90' } });
  assert.equal(media.currentTime, 90);
  assert.equal(state.draft, null);
  assert.equal(state.shownTime, 90, 'clearing the drag preview must not expose the old playback time');
  assert.equal(state.progress, 75);
  media.currentTime = 90.2;
  state.sync();
  assert.equal(state.shownTime, 90.2, 'normal playback resumes driving the position');
});

test('consecutive keyboard seeks accumulate before the next timeupdate and stay in bounds', (t) => {
  const { state, media, dispose } = player();
  t.after(dispose);
  const press = (key: string) => state.keyboard({ key, target: { closest: () => null }, preventDefault() {} });
  press('ArrowRight');
  press('ArrowRight');
  assert.equal(media.currentTime, 20);
  assert.equal(state.shownTime, 20);
  for (let index = 0; index < 5; index++) press('ArrowLeft');
  assert.equal(state.shownTime, 0);
  assert.equal(media.currentTime, 0);
});
