import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, ref } from 'vue';
import { useDialogLifecycle } from '../src/ui/composables/useDialogLifecycle.ts';

function fixture() {
  const open = ref(true), active = ref(true), dismissable = ref(true), reducedMotion = ref(false);
  let guard: () => boolean | Promise<boolean> | undefined = () => undefined;
  let closes = 0;
  const scope = effectScope();
  const lifecycle = scope.run(() => useDialogLifecycle({ open: () => open.value, active: () => active.value,
    dismissable: () => dismissable.value, reducedMotion: () => reducedMotion.value,
    beforeClose: () => guard(), closed: () => { closes++; open.value = false; } }))!;
  return { ...lifecycle, scope, open, active, dismissable, reducedMotion, setGuard: (next: typeof guard) => { guard = next; }, closes: () => closes };
}

test('closing releases presence without animation events and emits once', async () => {
  const dialog = fixture();
  try {
    await dialog.requestClose();
    assert.equal(dialog.contentOpen.value, false);
    assert.equal(dialog.mounted.value, true);
    await new Promise(resolve => setTimeout(resolve, 330));
    assert.equal(dialog.mounted.value, false);
    dialog.finishClose();
    assert.equal(dialog.closes(), 1);
  } finally { dialog.scope.stop(); }
});

test('reopening cancels old exit completion; external closes and inactive pages release presence', async () => {
  const dialog = fixture();
  try {
    dialog.open.value = false;
    dialog.open.value = true;
    dialog.finishClose();
    assert.equal(dialog.contentOpen.value, true);
    assert.equal(dialog.closes(), 0);
    await dialog.requestClose();
    dialog.active.value = false;
    assert.equal(dialog.mounted.value, false);
    dialog.active.value = true;
    assert.equal(dialog.mounted.value, false);
    assert.equal(dialog.closes(), 1);
  } finally { dialog.scope.stop(); }
});

test('stale async close approval cannot close a reopened dialog', async () => {
  const dialog = fixture();
  try {
    let approve!: (value: boolean) => void;
    dialog.setGuard(() => new Promise(resolve => { approve = resolve; }));
    const pending = dialog.requestClose();
    dialog.open.value = false;
    dialog.open.value = true;
    approve(true);
    await pending;
    assert.equal(dialog.contentOpen.value, true);
    assert.equal(dialog.closes(), 0);
    dialog.setGuard(() => false);
    await dialog.requestClose();
    assert.equal(dialog.contentOpen.value, true);
    dialog.dismissable.value = false;
    dialog.setGuard(() => true);
    await dialog.requestClose();
    assert.equal(dialog.contentOpen.value, true);
    dialog.dismissable.value = true;
    dialog.reducedMotion.value = true;
    await dialog.requestClose();
    assert.equal(dialog.mounted.value, false);
    assert.equal(dialog.closes(), 1);
  } finally { dialog.scope.stop(); }
});
