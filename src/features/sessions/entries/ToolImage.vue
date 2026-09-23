<script setup lang="ts">
import { ref, watch } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
const props=defineProps<{src:string;mime:string;path:string}>();
const url=ref(''),error=ref(false),size=ref(''),zoom=ref(false);
watch(()=>props.src,async(src,_,onCleanup)=>{
 const controller=new AbortController();let objectUrl='';
 onCleanup(()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);});
 url.value='';error.value=false;size.value='';zoom.value=false;
 try{const response=await fetch(src,{signal:controller.signal});if(!response.ok)throw new Error(String(response.status));const bytes=await response.arrayBuffer();if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(new Blob([bytes],{type:props.mime}));url.value=objectUrl;}catch{if(!controller.signal.aborted)error.value=true;}
},{immediate:true});
function loaded(event:Event){const img=event.target as HTMLImageElement;size.value=`${img.naturalWidth} × ${img.naturalHeight}`;}
</script>
<template>
 <figure class="tool-image">
  <button v-if="url&&!error" class="image-surface" :class="{zoom}" :aria-label="i18n.locale.value==='zh'?'切换原始尺寸':'Toggle original size'" @click="zoom=!zoom"><img :src="url" :alt="path" loading="lazy" decoding="async" @load="loaded" @error="error=true"/></button>
  <p v-if="error" role="status">{{i18n.locale.value==='zh'?'图片暂时无法加载。':'Image could not be loaded.'}}</p>
  <p v-else-if="!url">{{i18n.locale.value==='zh'?'正在读取图片…':'Loading image…'}}</p>
  <figcaption><span>{{path}}</span><span>{{size}}</span></figcaption>
 </figure>
</template>
<style scoped>
.tool-image{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;min-width:0}
.image-surface{display:block;width:100%;max-height:65dvh;overflow:auto;padding:12px;border:0;background:var(--bg-inset);cursor:zoom-in;text-align:center}
.image-surface img{display:block;max-width:100%;max-height:60dvh;object-fit:contain;margin:auto}.image-surface.zoom{cursor:zoom-out}.zoom img{max-width:none;max-height:none}
figcaption{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;font-size:12px;color:var(--fg-subtle)}figcaption span:first-child{overflow-wrap:anywhere;min-width:0}figcaption span:last-child{white-space:nowrap}p{padding:12px;font-size:13px}
</style>
