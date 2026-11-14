// Real keyboard dispatch through the application shortcut handler and mounted sidebar controls.
import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const html = `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {prefs} from '/src/core/state/prefsSlice.ts';
import {installShortcuts} from '/src/features/shell/shortcuts.ts';
import {sessionSidebarCommands} from '/src/features/sessions/sidebarCommands.ts';
import SessionListToggle from '/src/features/sessions/SessionListToggle.vue';
import IslandSidebar from '/src/ui/components/IslandSidebar.vue';
import Modal from '/src/ui/components/Modal.vue';
import Editor from '/src/domain/chat/InlineMessageEditor.vue';
import {useIsMobile} from '/src/ui/composables/useMedia.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'sidebar-shortcuts-test',version:1});
prefs.setSessionListCollapsed(false);
const router=createRouter({history:createMemoryHistory(),routes:[
 {path:'/s/fixture',meta:{section:'sessions'},component:{render:()=>null}},
 {path:'/settings',meta:{section:'settings'},component:{render:()=>null}}
]});
await router.push('/s/fixture');
const right=ref(false),hasRight=ref(true),modal=ref(false),searches=ref(0);
const draft=ref('leftright');
const stop=installShortcuts({...sessionSidebarCommands(router),openNewSession(){},openSettings(){},canSearchChat:()=>true,
 async focusSessionSearch(){searches.value++},async focusChatSearch(){searches.value++}});
createApp({setup(){const mobile=useIsMobile();return()=>h(TooltipProvider,{},()=>[
 h('main',{style:'position:relative;display:flex;height:600px;padding:50px'},[
  h(SessionListToggle),
  h('section',{style:'flex:1'},[
   hasRight.value?h('button',{'data-sidebar-toggle':'','aria-expanded':String(right.value),onClick:()=>right.value=!right.value},'Right sidebar'):null,
   h('input',{id:'field',value:'Keep input focus navigation'}),h('textarea',{id:'text'},'Draft'),
   h('div',{id:'editor',contenteditable:'true'},[h('span','Editable content')]),
   h(Editor,{id:'message-editor',text:draft.value,attachments:[],label:'Message',placeholder:'Type',scope:'fixture','onUpdate:text':value=>draft.value=value}),
   h('select',{id:'select'},[h('option','One')]),h('button',{id:'after-fields'},'Next control'),
   h('div',{'data-keyboard-boundary':''},[h('button',{id:'boundary'},'Local control')]),
  ]),
  h(IslandSidebar,{open:right.value,overlay:mobile.value,title:'Library',width:320},()=>[h('button',{id:'sidebar-first'},'First'),h('button',{id:'sidebar-second'},'Second')]),
 ]),
 h(Modal,{open:modal.value,title:'Dialog',onClose:()=>modal.value=false},()=>[h('button',{id:'modal-first'},'First'),h('button',{id:'modal-second'},'Second')])
]);}}).use(router).mount('#app');
window.fixture={right,hasRight,modal,searches,prefs,router,stop,draft};
</script></body></html>`;

await browserFixture(html, async ({ js, until, send }) => {
  const tab = async (modifiers = 0, autoRepeat = false) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers, autoRepeat });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers });
  };
  const blur = () => js('document.activeElement?.blur()');
  const state = () => js('[fixture.right.value,fixture.prefs.sessionListCollapsed.value]');
  await until('!!document.querySelector(".session-list-toggle")', 'left toggle mounts');
  await blur();
  await tab();
  assert.deepEqual(await state(), [true, false], 'Tab opens only the right sidebar');
  await tab(0, true);
  assert.deepEqual(await state(), [true, false], 'key repeat does not toggle again');
  await blur();
  await tab();
  assert.deepEqual(await state(), [false, false], 'Tab closes the right sidebar');
  await blur();
  await tab(8);
  assert.deepEqual(await state(), [false, true], 'Shift+Tab collapses only the left sidebar');
  await blur();
  await tab(8);
  assert.deepEqual(await state(), [false, false], 'Shift+Tab restores the left sidebar');
  const selectDraft = (start, end = start) => js(`(()=>{const editor=document.querySelector('#message-editor');editor.focus();const range=document.createRange();range.setStart(editor.firstChild,${start});range.setEnd(editor.firstChild,${end});getSelection().removeAllRanges();getSelection().addRange(range)})()`);
  const undo = async (redo = false) => {
    await send('Input.dispatchKeyEvent', {type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:redo?10:2});
    await send('Input.dispatchKeyEvent', {type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:redo?10:2});
  };
  await selectDraft(4);
  await tab();
  assert.equal(await js('fixture.draft.value'), 'left\tright', 'message Tab inserts a literal tab at the caret');
  assert.equal(await js('document.activeElement.id'), 'message-editor', 'message Tab retains focus');
  assert.deepEqual(await state(), [false, false], 'editor Tab does not toggle a sidebar');
  await send('Input.insertText', {text:'!'});
  assert.equal(await js('fixture.draft.value'), 'left\t!right', 'typing continues after the inserted tab');
  await undo();await undo();
  assert.equal(await js('fixture.draft.value'), 'leftright', 'Tab insertion can be undone');
  await undo(true);
  assert.equal(await js('fixture.draft.value'), 'left\tright', 'Tab insertion can be redone');
  await selectDraft(4, 10);
  await tab();
  assert.equal(await js('fixture.draft.value'), 'left\t', 'Tab replaces selected text');
  await undo();
  assert.equal(await js('fixture.draft.value'), 'left\tright', 'selection replacement can be undone');
  await tab(8);
  assert.notEqual(await js('document.activeElement.id'), 'message-editor', 'Shift+Tab still leaves the editor');
  assert.deepEqual(await state(), [false, false]);
  for (const selector of ['#field', '#text', '#editor', '#select', '#boundary', '#after-fields']) {
    for (const modifiers of [0, 8]) {
      await js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await tab(modifiers);
      assert.deepEqual(await state(), [false, false], selector + ' keeps native Tab behavior');
      assert.equal(await js(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`), false, 'Tab still moves focus');
    }
  }
  await js('fixture.right.value=true');
  await until('!!document.querySelector("#sidebar-first")', 'sidebar controls');
  await js('document.querySelector("#sidebar-first").focus()');
  await tab();
  assert.equal(await js('document.activeElement.id'), 'sidebar-second');
  await tab(8);
  assert.equal(await js('document.activeElement.id'), 'sidebar-first');
  assert.deepEqual(await state(), [true, false], 'sidebar controls preserve native traversal');
  await js('fixture.right.value=false');
  await js('fixture.modal.value=true');
  await until('!!document.querySelector("#modal-first")', 'dialog opens');
  await js('document.querySelector("#modal-first").focus()');
  await tab();
  assert.equal(await js('document.activeElement.id'), 'modal-second', 'dialog keeps its focus order');
  assert.deepEqual(await state(), [false, false]);
  await js('fixture.modal.value=false');
  await until('!document.querySelector("#modal-first")', 'dialog closes');
  await blur();
  for (const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]) {
    const prevented = await js(`(()=>{const event=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true,...${JSON.stringify(extra)}});document.body.dispatchEvent(event);return event.defaultPrevented})()`);
    assert.equal(prevented, false, 'modified and IME keys remain available');
  }
  await js('document.querySelector("#field").dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true,cancelable:true}))');
  assert.equal(await js('fixture.searches.value'), 1, 'existing Ctrl+K shortcut still works in fields');
  await js('fixture.router.push("/settings")');
  await blur();
  await tab();
  await tab(8);
  assert.deepEqual(await state(), [false, false], 'other routes do not toggle background sidebars');
  await js('fixture.router.push("/s/fixture");fixture.hasRight.value=false');
  await until('!document.querySelector("[data-sidebar-toggle]")', 'right control is absent');
  assert.equal(await js(`(()=>{const e=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented})()`), false, 'pages without a right sidebar keep Tab');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await until('!document.querySelector(".session-list-toggle")', 'mobile has no desktop left toggle');
  assert.equal(await js(`(()=>{const e=new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented})()`), false, 'mobile keeps Shift+Tab focus navigation');
  await js('fixture.hasRight.value=true');
  await until('!!document.querySelector("[data-sidebar-toggle]")', 'right control restored');
  await blur();
  await tab();
  await until('!!document.querySelector(".island-overlay[data-state=open]")', 'keyboard opens mobile sidebar');
  await js('document.querySelector("#sidebar-first").focus()');
  await tab();
  assert.equal(await js('fixture.right.value'), true, 'mobile sidebar retains its focus scope');
  assert.equal(await js('document.activeElement.id'), 'sidebar-second');
  await js('fixture.stop()');
  console.log('Sidebar shortcuts: left/right toggles, held keys, fields, dialogs, modifier keys, existing commands, route isolation and absent controls passed');
});
