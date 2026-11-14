import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
import { libraryMenu } from './libraryMenu.mjs';
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import Library from '/src/features/sessions/SessionLibrary.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
window.calls=[];window.fail=true;const session=ref('fixture');
window.fetch=async(input,options={})=>{
const url=new URL(String(input),location.href);let data={items:[],next:null,total:0};let status=200;
if(url.pathname.endsWith('/blobs/link')){const body=JSON.parse(options.body);window.calls.push({path:body.path,owner:url.pathname});if(body.path.includes('bad')&&window.fail){status=400;data={error:{message:'File not found'}};}else data={id:'a'.repeat(64),linked:true};}
else if(url.pathname.endsWith('/directories')){const path=url.searchParams.get('path');data={path:path==='~'?'/home/test':path,parent:'/',directories:['sub'],files:['one.pdf','two.pdf']};}
return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};
createApp({render:()=>h(TooltipProvider,{},()=>h(Library,{session:session.value,mobile:false,open:true,entries:[],libraryRevision:0}))}).mount('#app');window.fixture={session};
</script></body></html>`;
await browserFixture(html,async({js,until,click})=>{
 const menu = label => libraryMenu({js,until,click},label);
 await until('!!document.querySelector(".library-menu-trigger")','library');
 await menu('Link local|链接本地');
 await until('!!document.querySelector(".library-link-form textarea")','multiline input');
 await js(String.raw`(()=>{const el=document.querySelector('.library-link-form textarea');el.value='/tmp/a file.pdf\n/tmp/bad.pdf\n\n/tmp/c.pdf\n/tmp/a file.pdf';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await js(`document.querySelector('.library-link-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
 await until('calls.length===3 && !!document.querySelector(".library-link-error")','partial failure');
 assert.deepEqual(await js('calls.map(x=>x.path)'),['/tmp/a file.pdf','/tmp/bad.pdf','/tmp/c.pdf']);
 assert.equal(await js('document.querySelector(".library-link-form textarea").value'),'/tmp/bad.pdf');
 await js(`window.fail=false;document.querySelector('.library-link-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
 await until('!document.querySelector(".library-link-form")','successful retry closes');
 assert.equal(await js('calls.length'),4);
 await menu('Link local|链接本地');
 await until('!!document.querySelector(".library-link-form textarea")','reopen');
 assert.equal(await js('document.querySelector(".library-link-form textarea").value'),'');
 await click('.library-path-picker button');
 await until('document.querySelectorAll(".file-row").length===2','browse files');
 await js(`document.querySelectorAll('.file-row')[0].click();document.querySelectorAll('.file-row')[1].click()`);
 await until('document.querySelectorAll(".file-row[aria-pressed=true]").length===2','two selected');
 assert.ok(await js('(()=>{const b=document.querySelector(".directory-footer .primary");return b.clientWidth>80 && b.scrollWidth<=b.clientWidth+1})()'),'multi-file text button is not squeezed into an icon square');
 await click('.directory-footer .primary');
 await until('document.querySelector(".library-link-form textarea").value.split("\\n").length===2','picker fills paths');
 console.log('Multiline links: spaces, blanks, deduplication, partial success, retry and file multi-selection passed');
});
