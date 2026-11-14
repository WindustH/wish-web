import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,provide,ref} from 'vue';
import {TooltipProvider} from 'reka-ui';
import Markdown from '/src/domain/references/ReferenceMarkdown.vue';
import {fileMentionKey} from '/src/domain/references/useFileMention.ts';
import {resolveEnvironmentMention} from '/src/core/blobMentions.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
const owner=ref('self');
window.opened=[];
const text=[
 '[PDF]($WISH_BLOB_ROOT/$WISH_BLOB_ID_A#page=3)',
 '[Video](wish://blob/$WISH_SESSION_ID_Z/$WISH_BLOB_ID_10?time=12.5)',
 '[Braces](\${WISH_BLOB_ROOT}/\${WISH_BLOB_ID_A})',
].join('\\n\\n');
createApp({setup(){
 provide(fileMentionKey, async mention => {
   if(mention.kind!=='environment')throw Error('not an environment reference');
   const env={WISH_BLOB_ROOT:'/data/'+owner.value,WISH_SESSION_ID_Z:'peer',
     WISH_BLOB_ID_A:(owner.value==='self'?'a':'c').repeat(64),WISH_BLOB_ID_10:'b'.repeat(64)};
   const resolved=resolveEnvironmentMention(mention.href,env,owner.value);
   if(!resolved)throw Error('reference did not resolve');
   window.opened.push(resolved);
 });
 return()=>h(TooltipProvider,{},()=>h(Markdown,{text}));
}}).mount('#app');
window.fixture={owner};
</script></body></html>`;
await browserFixture(html, async ({ js, until, click }) => {
  await until('document.querySelectorAll("a.file-mention").length===3', 'all variable links render as file cards');
  const before = await js('location.href');
  await click('a.file-mention');
  await until('opened.length===1', 'PDF reference opens');
  assert.deepEqual(await js('({owner:opened[0].owner,id:opened[0].id,page:opened[0].page})'), {
    owner: 'self',
    id: 'a'.repeat(64),
    page: 3,
  });
  await js('document.querySelectorAll("a.file-mention")[1].click()');
  await until('opened.length===2', 'foreign-session video opens');
  assert.equal(await js('opened[1].owner'), 'peer');
  assert.equal(await js('opened[1].time'), 12.5);
  await js('fixture.owner.value="other";document.querySelectorAll("a.file-mention")[2].click()');
  await until('opened.length===3', 'braced variable opens in its owner namespace');
  assert.equal(await js('opened[2].owner'), 'other');
  assert.equal(await js('opened[2].id'), 'c'.repeat(64));
  assert.equal(await js('location.href'), before, 'reference clicks do not navigate the browser');
  console.log(JSON.stringify({ ok: true, links: 3, base36: true, scoped: true }));
});
