import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {browserFixture} from './browserFixture.mjs';
const bytes=await readFile(process.env.VIDEO_SAMPLE??'/tmp/wish-player-fixture.webm');
const html=`<!doctype html><html data-theme="dark"><body><div id="app" style="width:560px;height:440px;margin:30px"></div><script type="module">
import {createApp,h} from 'vue';
import VideoPlayer from '/src/domain/media/VideoPlayer.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
createApp({render:()=>h(VideoPlayer,{src:'data:video/webm;base64,${bytes.toString('base64')}',label:'Test video',onReady:element=>window.video=element})}).mount('#app');window.fixture=true;
</script></body></html>`;
await browserFixture(html,async({js,until,click,send})=>{
 await until('window.video?.readyState>=2','video loads');
 assert.equal(await js('window.video.controls'),false);
 await click('.video-play');await until('!window.video.paused','custom play');
 await click('.video-play');await until('window.video.paused','custom pause');
 await js(`(()=>{const slider=document.querySelector('.video-seek');slider.value='2';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until('Math.abs(window.video.currentTime-2)<.2','seek');
 await click('.video-volume button');assert.equal(await js('window.video.muted'),true);
 await js(`(()=>{const slider=document.querySelector('.video-volume input');slider.value='.4';slider.dispatchEvent(new Event('input',{bubbles:true}));const speed=document.querySelector('.video-speed');speed.value='1.5';speed.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await js('window.video.muted'),false);assert.equal(await js('window.video.volume'),.4);assert.equal(await js('window.video.playbackRate'),1.5);
 await click('.video-buttons > button:last-child');await until('!!document.fullscreenElement','fullscreen enters');
 assert.equal(await js('document.fullscreenElement.contains(document.querySelector(".video-speed"))'),true);
 await js('document.exitFullscreen()');await until('!document.fullscreenElement','fullscreen exits');
 await js('document.querySelector("#app").style.width="280px"');
 assert.equal(await js('document.querySelector(".video-buttons").scrollWidth<=document.querySelector(".video-buttons").clientWidth'),true,'narrow controls fit');
 for(const theme of ['dark','light']) {
  await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`/tmp/wish-video-${theme}.png`,Buffer.from(shot.data,'base64'));
 }
 console.log('Video controls: play/pause, seeking, mute/volume, speed, fullscreen, 280px width, dark/light passed');
});
