// Regression evidence for the source review: document identity, IME, focus and gesture isolation.
import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const html = String.raw`<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import {i18n} from '/src/core/i18n/index.ts';
import {TooltipProvider} from 'reka-ui';
import Markdown from '/src/ui/components/Markdown.vue';
import {renderMarkdown,createMarkdownBlocks} from '/src/ui/markdown.ts';
import Editor from '/src/domain/chat/InlineMessageEditor.vue';
import MenuBackdrop from '/src/ui/components/MenuBackdrop.vue';
import Modal from '/src/ui/components/Modal.vue';
import {installScrollStallLog} from '/src/domain/diagnostics/scrollStalls.ts';
import {setActivityEnabled} from '/src/domain/diagnostics/activityStore.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {applyTokens} from '/src/ui/applyTokens.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/math.css';
registerBrowserPlatform({namespace:'wish-source-review',version:1});applyTokens();
setActivityEnabled(false);installScrollStallLog();
const text=ref('abcXYZ'),attachments=ref([]),editor=ref(),markdown=ref('First **stable** paragraph.\n\nSecond paragraph.'),streaming=ref(true),menu=ref(false),modal=ref(false),clicks=ref(0);
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'padding:20px'},[
 h('button',{id:'open-menu',class:'btn',onClick:()=>menu.value=true},'Open menu'),
 h('button',{id:'next-action',class:'btn',onClick:()=>clicks.value++},'Next action'),
 h('button',{id:'open-modal',class:'btn',onClick:()=>modal.value=true},'Open dialog'),
 h(MenuBackdrop,{open:menu.value,onClose:()=>menu.value=false}),
 h(Editor,{ref:editor,text:text.value,attachments:attachments.value,label:'Draft',placeholder:'Type',scope:'fixture','onUpdate:text':value=>text.value=value,style:'margin:12px 0;border:1px solid gray;min-height:40px'}),
 h('section',{id:'markdown-host',style:'height:260px;overflow:auto'},[h(Markdown,{text:markdown.value,streaming:streaming.value})]),
 h(Modal,{open:modal.value,title:'Review dialog',onClose:()=>modal.value=false},()=>h('button',{id:'dialog-action',class:'btn'},'Dialog action')),
]))}).mount('#app');
window.fixture={copyLabel:()=>i18n.t('common.copy'),text,attachments,editor,markdown,streaming,menu,modal,clicks,nextTick,renderMarkdown,createMarkdownBlocks,setActivityEnabled};
</script></body></html>`;

await browserFixture(html, async ({ send, js, until, click }) => {
  const setMarkdown = async (text, streaming = true) =>
    js(
      `(async()=>{fixture.markdown.value=${JSON.stringify(text)};fixture.streaming.value=${streaming};await fixture.nextTick();})()`,
    );
  await js(
    `window.savedParagraph=document.querySelector('.markdown p');const selection=getSelection();const range=document.createRange();range.selectNodeContents(savedParagraph);selection.removeAllRanges();selection.addRange(range);`,
  );
  await setMarkdown('First **stable** paragraph.\n\nSecond paragraph grows.\n\nThird paragraph.');
  assert.equal(
    await js(`savedParagraph===document.querySelector('.markdown p') && getSelection().anchorNode===savedParagraph`),
    true,
    'completed DOM and selection survive stream appends',
  );
  const documents = [
    '- one\n  - nested\n\n- two\n\n> a quote\n> continued\n',
    '| A | B |\n|---|---|\n| 1 | 2 |\n\n$$x^2 + y^2$$\n\nInline $x$ math.',
    '[late reference][link]\n\n[link]: https://example.com "Example"',
    '```js\nconst x = "safe";\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))',
  ];
  for (const document of documents) {
    await setMarkdown(document, false);
    assert.equal(
      await js(
        `(()=>{const actual=document.createElement('div');actual.innerHTML=[...document.querySelectorAll('.markdown-block')].map(block=>block.innerHTML).join('');const expected=document.createElement('div');expected.innerHTML=fixture.renderMarkdown(${JSON.stringify(document)},fixture.copyLabel());return actual.innerHTML===expected.innerHTML;})()`,
      ),
      true,
      'block rendering matches whole-document semantics',
    );
  }
  await setMarkdown('[a reference][later]\n\nTail');
  assert.equal(await js(`!!document.querySelector('.markdown a')`), false);
  await setMarkdown('[a reference][later]\n\nTail\n\n[later]: https://example.com');
  assert.equal(
    await js(`document.querySelector('.markdown a')?.href`),
    'https://example.com/',
    'later references invalidate earlier inline parsing',
  );
  await setMarkdown('```js\nconst x = 1;');
  assert.equal(
    await js(`!!document.querySelector('.markdown .hljs-keyword')`),
    false,
    'unfinished fences defer highlighting',
  );
  await setMarkdown('```js\nconst x = 1;\n```');
  assert.equal(await js(`!!document.querySelector('.markdown .hljs-keyword')`), true);
  await js(`window.codeNode=document.querySelector('.markdown pre');`);
  await setMarkdown('```js\nconst x = 1;\n```\n\nMore words.');
  assert.equal(
    await js(`codeNode===document.querySelector('.markdown pre')`),
    true,
    'completed fences retain their DOM',
  );

  const longStream = await js(
    `(async()=>{const prefix=Array.from({length:300},(_,i)=>'Paragraph '+i+' **stable text**.').join('\\n\\n')+'\\n\\n';fixture.markdown.value=prefix+'Tail';await fixture.nextTick();const first=document.querySelector('.markdown p');const start=performance.now();for(let i=0;i<40;i++){fixture.markdown.value=prefix+'Tail '+i;await fixture.nextTick();}return {stable:first===document.querySelector('.markdown p'),milliseconds:Math.round(performance.now()-start),updates:40,paragraphs:300};})()`,
  );
  assert.equal(longStream.stable, true, 'large stream retains its completed prefix across repeated updates');
  await setMarkdown('前言。\n\n**Socket（套接字）');
  await js(`window.socketPrefix=document.querySelector('.markdown p');`);
  const socketText = '前言。\n\n**Socket（套接字）**是计算机网络通信的核心概念。';
  for (const streaming of [true, false]) {
    await setMarkdown(socketText, streaming);
    assert.equal(await js(`document.querySelector('.markdown strong')?.textContent`), 'Socket（套接字）');
    assert.equal(await js(`getComputedStyle(document.querySelector('.markdown strong')).fontWeight`), '600');
    assert.equal(await js(`socketPrefix===document.querySelector('.markdown p')`), true);
  }
  await js(
    `(()=>{const editor=document.querySelector('[contenteditable=true]');window.nativeText=editor.firstChild;window.rebuilds=0;const replace=editor.replaceChildren.bind(editor);editor.replaceChildren=(...nodes)=>{window.rebuilds++;return replace(...nodes);};editor.focus();const range=document.createRange();range.setStart(editor.firstChild,3);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);})()`,
  );
  await send('Input.insertText', { text: '你' });
  assert.equal(await js('fixture.text.value'), 'abc你XYZ');
  assert.equal(
    await js(`nativeText===document.querySelector('[contenteditable=true]').firstChild && rebuilds===0`),
    true,
    'ordinary input retains native text nodes',
  );
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'z',
    code: 'KeyZ',
    modifiers: 2,
    windowsVirtualKeyCode: 90,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'z',
    code: 'KeyZ',
    modifiers: 2,
    windowsVirtualKeyCode: 90,
  });
  assert.equal(await js('fixture.text.value'), 'abcXYZ');
  assert.equal(await js('getSelection().anchorOffset'), 3, 'Undo restores the original caret, not the end');
  await js('window.rebuilds=0');
  await send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
  await send('Input.insertText', { text: '你' });
  assert.equal(await js('fixture.text.value'), 'abc你XYZ');
  assert.equal(await js('rebuilds'), 0, 'IME commit does not rebuild the editor');
  assert.equal(
    await js(
      `(()=>{const selection=getSelection(),native=selection.modify;selection.modify=undefined;try{return fixture.editor.value.atHistoryBoundary(-1)===false;}finally{selection.modify=native;}})()`,
    ),
    true,
    'missing Selection.modify cannot throw',
  );
  await js(
    `(async()=>{fixture.attachments.value=[{kind:'image',name:'test.png',placeholder:'<image-'+ 'a'.repeat(64)+'>'}];await fixture.nextTick();fixture.editor.value.moveCaretToEnd();fixture.editor.value.focus();})()`,
  );
  await send('Input.insertText', { text: '<image-' + 'a'.repeat(64) + '>' });
  assert.equal(
    await js(`document.querySelectorAll('[data-attachment-token]').length`),
    1,
    'new attachment placeholders still become atomic tokens',
  );

  await click('#open-menu');
  await until('!!document.querySelector(".menu-backdrop")', 'menu backdrop');
  await click('#next-action');
  assert.equal(await js('fixture.clicks.value'), 0, 'the closing press cannot click through');
  assert.equal(await js('!!document.querySelector(".menu-backdrop")'), false, 'closing leaves no invisible layer');
  await click('#next-action');
  assert.equal(await js('fixture.clicks.value'), 1, 'the immediately following gesture works');
  await click('#open-modal');
  await until('!!document.querySelector("[role=dialog]")', 'dialog opens');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until('!document.querySelector("[role=dialog]")', 'dialog closes');
  assert.equal(
    await js('document.activeElement.id'),
    'open-modal',
    'focus returns to the real opener after pointer activation',
  );
  const diagnosticCounts = await js(
    `(async()=>{const add=window.addEventListener,remove=window.removeEventListener;const listeners=new Set();window.addEventListener=function(type,fn,...rest){listeners.add(fn);return add.call(this,type,fn,...rest);};window.removeEventListener=function(type,fn,...rest){listeners.delete(fn);return remove.call(this,type,fn,...rest);};try{const disabled=listeners.size;fixture.setActivityEnabled(true);await fixture.nextTick();const enabled=listeners.size;fixture.setActivityEnabled(false);await fixture.nextTick();return {disabled,enabled,stopped:listeners.size};}finally{window.addEventListener=add;window.removeEventListener=remove;}})()`,
  );
  assert.equal(diagnosticCounts.disabled, 0);
  assert.ok(diagnosticCounts.enabled > 0);
  assert.equal(diagnosticCounts.stopped, 0, 'disabling diagnostics releases every gesture listener');
  console.log(
    JSON.stringify({
      ok: true,
      longStream,
      checks: [
        'stable Markdown DOM and selection',
        'whole-document Markdown semantics',
        'late references',
        'deferred highlighting',
        'native input',
        'IME',
        'Undo caret',
        'Selection.modify fallback',
        'attachment tokens',
        'outside menu gesture',
        'dialog focus',
        'opt-in diagnostics',
      ],
    }),
  );
});
