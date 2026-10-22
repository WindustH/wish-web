import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { effectScope, nextTick, reactive } from 'vue';

const require = createRequire(import.meta.url);
const file = new URL('../src/ui/components/MenuBackdrop.vue', import.meta.url);
const script = readFileSync(file, 'utf8').split('<script setup lang="ts">')[1]!.split('</script>')[0]!;
// Execute only the setup logic with Vue's real reactivity, without needing a browser renderer.
const compiled = ts.transpileModule(`${script.replace(/import .* from 'vue';/, 'const { ref, watch } = require(\"vue\");')}\nreturn { up, press, release, clicked };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('a missing pointerup cannot leave a closed menu backdrop over the page', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const props = reactive({ open: true });
  const listeners = new Map<string, () => void>();
  const browser = {
    addEventListener(name: string, callback: () => void) { listeners.set(name, callback); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const scope = effectScope();
  const backdrop = scope.run(() => new Function('require', 'defineProps', 'defineEmits', 'window', 'onBeforeUnmount', compiled)(
    require, () => props, () => (name: string) => { if (name === 'close') props.open = false; },
    browser, () => {},
  )) as { up: { value: boolean }; press: () => void; release: () => void; clicked: () => void };
  assert.equal(backdrop.up.value, true);
  backdrop.press();
  await nextTick();
  assert.equal(props.open, false);
  assert.equal(backdrop.up.value, true); // the current press is still shielded
  t.mock.timers.tick(1500); // no pointerup or pointercancel was delivered
  await nextTick();
  assert.equal(backdrop.up.value, false);
  scope.stop();
});
