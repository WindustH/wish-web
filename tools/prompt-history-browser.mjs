// Composer prompt history with mocked HTTP, real keyboard events and attachment previews.
// Run: node tools/prompt-history-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {TooltipProvider} from 'reka-ui';
import Composer from '/src/features/sessions/Composer.vue';
import AttachmentPreview from '/src/ui/components/AttachmentPreview.vue';
import {chat} from '/src/core/state/chatSlice.ts';
import {uploadAttachments,attachmentDraftsFor} from '/src/core/attachments.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform();
const owner=ref('A');chat.sessionId.value='A';
const hash='a'.repeat(64), fileHash='b'.repeat(64);
const metadata={attachments:[{kind:'image',id:hash,name:'pixel.png',placeholder:'<image-'+hash+'>'},{kind:'file',id:fileHash,name:'notes.txt',placeholder:'<file-'+fileHash+'>'}],input_parts:[{type:'text',text:'inspect '},{type:'attachment',index:0},{type:'text',text:' and '},{type:'attachment',index:1}]};
const entry=(seq,text,meta={})=>({record:{sequence:seq,recorded_at:0},content:{kind:'message',value:{id:seq,message:{User:{content:[{Text:{text}}],metadata:meta}}}}});
const pixel=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
let uploads=0,sent=null;
const nativeFetch=window.fetch;
window.fetch=async(input,opts)=>{
 const url=String(input);
 if(url.includes('/history'))return new Response(JSON.stringify({items:url.includes('/A/')?[entry(2,'image',metadata),entry(1,'first A')]:[entry(1,'only B')],next:null}),{headers:{'content-type':'application/json'}});
 if(url.includes('/blobs/'))return new Response(url.endsWith(hash)?pixel:'file preview text',{headers:{'content-type':url.endsWith(hash)?'image/png':'text/plain'}});
 if(url.endsWith('/blobs')){uploads++;throw new Error('Unexpected upload');}
 return nativeFetch(input,opts);
};
chat.send=async(text,attachments)=>{sent={text,...await uploadAttachments(owner.value,attachments)};return 'receipt';};
window.fixture={owner,chat,attachmentDraftsFor,get uploads(){return uploads},get sent(){return sent},switchSession(id){owner.value=id;chat.sessionId.value=id;}};
createApp({render:()=>h(TooltipProvider,{},()=>[h(Composer,{owner:owner.value,mobile:false}),h(AttachmentPreview)])}).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__prompt_history', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__prompt_history', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/Composer.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-prompt-history-'));
let chrome, ws;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  chrome = spawn(process.env.CHROME || '/usr/bin/google-chrome-stable', ['--headless=new','--no-first-run','--disable-extensions',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'], { stdio: 'ignore' });
  let debugPort;
  for(let n=0;n<100;n++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  assert.ok(debugPort, 'Chrome must start');
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(), exceptions=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('document.body.innerHTML.slice(0,1500)'),fixture:await js('!!window.fixture')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__prompt_history`});
  await until('!!window.fixture && !!document.querySelector("[contenteditable=true]")','composer mounted');
  const editor='document.querySelector(".composer [contenteditable=true]")';
  const key=async key=>{const windowsVirtualKeyCode={ArrowUp:38,ArrowDown:40,Enter:13,Escape:27}[key];await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode});};
  await js(editor+'.focus()');
  await send('Input.insertText',{text:'unsent draft'});
  await key('ArrowUp');
  await until('document.querySelectorAll(".attach-thumb").length===2','history attachments');
  await until('document.querySelector(".attach-thumb img")?.naturalWidth>0','image thumbnail loads');
  assert.equal(await js('document.querySelectorAll(".inline-attachment-token").length'),2);
  await js('document.querySelector(".attachment-file").click()');
  await until('document.body.innerText.includes("file preview text")','file preview matches original');
  await key('Escape');
  await js(editor+'.focus()');
  await key('ArrowUp');
  await until('fixture.chat.getDraft("A")==="first A"','older prompt');
  await key('ArrowDown');
  await until('document.querySelectorAll(".attach-thumb").length===2','return to image prompt');
  await key('ArrowDown');
  await until('fixture.chat.getDraft("A")==="unsent draft"','unsent draft restored');
  assert.equal(await js('document.querySelectorAll(".attach-thumb").length'),0);
  await js('fixture.switchSession("B")');
  await sleep(100);await js(editor+'.focus()');await key('ArrowUp');
  await until('fixture.chat.getDraft("B")==="only B"','independent B history');
  assert.equal(await js('document.querySelectorAll(".attach-thumb").length'),0);
  await js('fixture.switchSession("A")');await sleep(100);await js(editor+'.focus()');
  assert.equal(await js('fixture.chat.getDraft("A")'),'unsent draft');
  await key('ArrowUp');
  await until('document.querySelectorAll(".attach-thumb").length===2','restore A attachments again');
  await js('fixture.switchSession("B")');await sleep(100);
  await js('fixture.switchSession("A")');await sleep(100);await js(editor+'.focus()');
  await js('(()=>{const e='+editor+';const r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)})()');
  await key('ArrowDown');
  await until('fixture.chat.getDraft("A")==="unsent draft"','original draft survives switching during history browsing');
  await key('ArrowUp');
  await until('document.querySelectorAll(".attach-thumb").length===2','recall for resend');
  await sleep(100);await key('Enter');
  await until('!!fixture.sent','resend recalled prompt');
  assert.equal(await js('fixture.uploads'),0,'reusing history never uploads a second copy');
  assert.equal(await js('fixture.sent.blocks.length'),2);
  assert.equal(await js('fixture.sent.blocks[0].blob_id'),'a'.repeat(64));
  await until('fixture.chat.getDraft("A")===""','successful send clears composer');
  await js(editor+'.focus()');
  await send('Input.insertText',{text:'line one'});
  await js(editor+'.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertLineBreak",bubbles:true,cancelable:true}))');
  await send('Input.insertText',{text:'line two'});
  await key('ArrowUp');
  assert.equal(await js('fixture.chat.getDraft("A")'),'line one\nline two','Up within a multiline draft moves the caret, not history');
  await key('ArrowUp');
  await until('document.querySelectorAll(".attach-thumb").length===2','Up at first line recalls history');
  await js(`fixture.switchSession('unsupported-image');`);
  await sleep(100);
  await js(`(()=>{
    const bytes=new Uint8Array([0,0,0,24,...new TextEncoder().encode('ftypheic'),0,0,0,0,...new TextEncoder().encode('heicmif1')]);
    const data=new DataTransfer();data.items.add(new File([bytes],'misnamed.png',{type:'image/png'}));
    document.querySelector('[contenteditable]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  })()`);
  await until(`fixture.attachmentDraftsFor('unsupported-image').length===1`,'unsupported image becomes an attachment');
  assert.equal(await js(`fixture.attachmentDraftsFor('unsupported-image')[0].kind`),'file');
  assert.equal(await js(`fixture.attachmentDraftsFor('unsupported-image')[0].bytes.byteLength`),24);
  assert.equal(await js(`fixture.attachmentDraftsFor('unsupported-image')[0].mime`),'image/heif');
  assert.ok(await js(`fixture.chat.getDraft('unsupported-image').includes('<file-')`),'editor uses a file token');
  assert.deepEqual(exceptions,[],'no runtime exceptions');
  console.log(JSON.stringify({ok:true,checks:['session isolation','draft restoration','history attachment tokens and image preview','file preview','resend without uploads','multiline caret navigation']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
