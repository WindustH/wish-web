import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { browserFixture } from './browserFixture.mjs';
const bytes = await readFile(process.env.VIDEO_SAMPLE);
const server = createServer((request,response)=>{
  const match=/bytes=(\d+)-(\d*)/.exec(request.headers.range??'');
  const start=match?Number(match[1]):0, end=match&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
  response.writeHead(match?206:200,{'Content-Type':'video/x-matroska','Accept-Ranges':'bytes','Content-Length':end-start+1,...(match?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});
  response.end(request.method==='HEAD'?undefined:bytes.subarray(start,end+1));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const html=`<html><body><div id="app"></div><script type="module">
  import {createApp,h} from 'vue';
  import Preview from '/src/features/sessions/SessionBlobPreview.vue';
  import {setBaseUrl} from '/src/core/api/client.ts';
  setBaseUrl('http://127.0.0.1:${server.address().port}');
  window.fetch=async()=>Response.json({path:'/movie',expires_at:9999999999});
  createApp({render:()=>h(Preview,{session:'fixture',blob:{id:'sample',mime_type:'video/x-matroska',byte_count:${bytes.length}},name:'Hi10p.mkv'})}).mount('#app');
  window.fixture=true;
  </script></body></html>`;
  await browserFixture(html,async({js,until})=>{
    await until('!!document.querySelector("video")||!!document.querySelector("[role=alert]")','video mounts');
    await until('document.querySelector("video")?.readyState>=2||!!document.querySelector("[role=alert]")','media metadata loads');
    // Desktop Chrome may software-decode Hi10p. Reproduce the mobile audio-only
    // metadata path without rejecting supported desktop playback.
    await js(`(()=>{const video=document.querySelector('video');if(video){Object.defineProperty(video,'videoWidth',{value:0});Object.defineProperty(video,'videoHeight',{value:0});video.dispatchEvent(new Event('loadeddata'));}})()`);
    await until('!!document.querySelector("[role=alert]")','unsupported track gets explicit fallback');
    const message=await js('document.querySelector("[role=alert]").textContent');
    assert.match(message,/本地播放器|local player/);
    assert.equal(await js('!!document.querySelector("video")'),false,'stop unsupported video instead of leaving black player');
    console.log(JSON.stringify({ok:true,message}));
  });
} finally { await new Promise(resolve=>server.close(resolve)); }
