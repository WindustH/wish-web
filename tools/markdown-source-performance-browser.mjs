import { browserFixture } from './browserFixture.mjs';
import {execFileSync} from 'node:child_process';
import {writeFile,rm} from 'node:fs/promises';
const path='src/ui/.markdownBaseline.ts';
await writeFile(path,execFileSync('git',['show',`${process.env.BASELINE_REF??'HEAD'}:src/ui/markdown.ts`]));
try {
 const html=`<html><body><script type="module">
 import {createMarkdownBlocks as baseline} from '/src/ui/.markdownBaseline.ts';
 import {createMarkdownBlocks as mapped} from '/src/ui/markdown.ts';
 const paragraph=${JSON.stringify('A paragraph with **bold**, _emphasis_, [a link](https://example.com), `code`, &amp; and repeated words.\n\n')};
 window.bench=()=>{
  const results={};
  for(const [name,factory] of [['baseline',baseline],['mapped',mapped]]) {
   const source=paragraph.repeat(400), cold=[],stream=[];
   for(let round=0;round<5;round++) {
    const render=factory(),start=performance.now();render(source,'Copy');cold.push(performance.now()-start);
    const updates=performance.now();for(let i=0;i<30;i++)render(source+'Live '+'.'.repeat(i+1),'Copy',true);stream.push((performance.now()-updates)/30);
   }
   const median=a=>a.sort((x,y)=>x-y)[2];results[name]={coldMs:median(cold),streamUpdateMs:median(stream)};
  }
  return results;
 };window.fixture=true;
 </script></body></html>`;
 await browserFixture(html,async({js})=>console.log(JSON.stringify(await js('window.bench()'))));
} finally {await rm(path,{force:true});}
