import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const source = '# Title\n\nHello **bold** and [link](https://example.com) then `code`.\n\nRepeat **bold** again.\n\n```ts\nconst x = 1;\n```\n\n- First\n- Second';
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import Markdown from '/src/ui/components/Markdown.vue';
import MessageContext from '/src/domain/chat/entries/MessageContext.vue';
import {markdownSelection} from '/src/ui/markdownSelection.ts';
window.source=${JSON.stringify(source)};
const content=ref(window.source);window.update=async text=>{content.value=text;await nextTick()};
createApp({render:()=>h(MessageContext,{text:content.value,kind:'assistant'},{default:()=>h('div',{class:'body'},[h(Markdown,{text:content.value})])})}).mount('#app');
window.extract=(selector,from,to)=>{
 const el=document.querySelector(selector), r=document.createRange();
 if(from===undefined) r.selectNodeContents(el); else {const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,offset=0;while(n=w.nextNode()){const len=n.textContent.length;if(from>=offset&&from<offset+len)r.setStart(n,from-offset);if(to>offset&&to<=offset+len){r.setEnd(n,to-offset);break;}offset+=len;}}
 return markdownSelection(r,document.querySelector('#app'),r.toString());
};window.fixture=true;
</script></body></html>`;
await browserFixture(html,async({js})=>{
 assert.equal(await js('extract("h1")'),'# Title');
 assert.equal(await js('extract("strong")'),'**bold**');
 assert.equal(await js('extract("strong",1,3)'),'ol');
 assert.equal(await js('extract("a")'),'[link](https://example.com)');
 assert.equal(await js('extract("p code")'),'`code`');
 assert.equal(await js('extract(".markdown-block:nth-child(3) strong")'),'**bold**');
 assert.equal(await js('extract("pre code")'),'```ts\nconst x = 1;\n```');
 assert.equal(await js('extract("li")'),'- First');
 assert.equal(await js('extract("ul")'),'- First\n- Second');
 assert.equal(await js('extract(".markdown")'),source);
 assert.equal(await js(`(()=>{
 const r=document.createRange();r.selectNodeContents(document.querySelector('strong'));
 const s=document.getSelection();s.removeAllRanges();s.addRange(r);
 const data=new DataTransfer();document.querySelector('strong').dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));
 return data.getData('text/plain');
 })()`),'**bold**');
 for(const [text,selector,from,to,expected] of [
   ['A &amp; B','p',2,3,'&amp;'],
   ['A \\* B','p',2,3,'\\*'],
   ['A ... B','p',2,3,'...'],
   ['A (c) B','p',2,3,'(c)'],
   ['A **_nested_** B','em',undefined,undefined,'**_nested_**'],
   ['> quote **bold**','strong',undefined,undefined,'**bold**'],
   ['- one\n  - two **bold**','strong',undefined,undefined,'**bold**'],
   ['| a | b |\n| - | - |\n| same | **same** |','td strong',undefined,undefined,'**same**'],
   ['first\r\n\r\n**bold** end','strong',undefined,undefined,'**bold**'],
   ['first\r\r**bold** end','strong',undefined,undefined,'**bold**'],
   ['before $x^2$ after','[data-md-atom]',undefined,undefined,'$x^2$'],
 ]) {
   await js(`window.update(${JSON.stringify(text)})`);
   assert.equal(await js(`extract(${JSON.stringify(selector)},${from},${to})`),expected,text);
 }
 await js('window.update("Start **bold** and old")');
 await js('window.stableStrong=document.querySelector("strong")');
 const before=await js('document.querySelector("strong").outerHTML');
 await js('window.update("Start **bold** and old\\n\\nNew streaming paragraph")');
 assert.equal(await js('extract("strong")'),'**bold**');
 assert.equal(await js('document.querySelector("strong").outerHTML'),before);
 assert.equal(await js('document.querySelector("strong")===window.stableStrong'),true,'stable streaming block keeps DOM identity');
 await js('window.update("A &amp; B &#x26; C")');
 assert.equal(await js('extract("p",2,3)'),'&amp;');
 await js('window.update("A &#x26; B &amp; C")');
 assert.equal(await js('extract("p",2,3)'),'&#x26;');
 console.log('Markdown selection: heading, inline formatting, partial word, link, repeated text, code fence, list, entire message passed');
});
