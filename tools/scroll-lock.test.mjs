import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { computed, ref, watch, nextTick, effectScope } from 'vue';
const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve('reka-ui').replace(/index\.cjs$/, 'shared/useBodyScrollLock.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export .*;$/gm, '');
function harness() {
  const cleanup = [];
  const body = { style: {pointerEvents:'',overflow:'',paddingRight:'',marginRight:''} };
  const document = {body,documentElement:{clientWidth:100,style:{removeProperty(){},setProperty(){}}}};
  const scope = effectScope();
  const lock = scope.run(() => new Function('computed','ref','watch','nextTick','createSharedComposable','useEventListener','isClient','isIOS','tryOnBeforeUnmount','injectConfigProviderContext','defu','document','window',source+'\n;return useBodyScrollLock;')(
    computed,ref,watch,nextTick,fn=>{let shared;return ()=>shared??=fn();},()=>()=>{},true,false,fn=>cleanup.push(fn),()=>({scrollBody:ref(true)}),Object.assign,document,{innerWidth:100}
  ));
  return {body,lock,cleanup,scope};
}
test('scroll lock cannot poison a later modal pointer-event baseline',async()=>{
 const h=harness();
 h.scope.run(()=>h.lock(true)); await nextTick();
 assert.equal(h.body.style.pointerEvents,'');
 const original=h.body.style.pointerEvents;
 h.body.style.pointerEvents='none'; // DismissableLayer acquires its own lock.
 h.cleanup[0](); await nextTick();
 assert.equal(h.body.style.pointerEvents,'none'); // Scroll cleanup must not unlock a modal.
 h.body.style.pointerEvents=original;
 assert.equal(h.body.style.pointerEvents,'');
 assert.equal(h.body.style.overflow,'');h.scope.stop();
});
test('nested scroll owners restore overflow only after the last closes',async()=>{
 const h=harness(); h.body.style.overflow='clip';
 h.scope.run(()=>{h.lock(true);h.lock(true);});await nextTick();
 h.cleanup[0]();await nextTick();assert.equal(h.body.style.overflow,'hidden');
 h.cleanup[1]();await nextTick();assert.equal(h.body.style.overflow,'clip');h.scope.stop();
});
