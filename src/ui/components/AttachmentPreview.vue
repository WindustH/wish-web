<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { attachmentPreview } from '../attachmentPreview';
import { apiFetch } from '../../core/api/client.js';
import BubbleSurface from './BubbleSurface.vue';
const panel = ref<HTMLElement | null>(null);
const position = ref<Record<string, string>>({});
const side = ref('above');
const title = ref('');
let frame = 0;
let observer: ResizeObserver | undefined;
function schedule() { if (!frame) frame = requestAnimationFrame(place); }
function place() {
  frame = 0;
  const anchor = attachmentPreview.value?.anchor;
  if (!anchor || !panel.value) return;
  if (!anchor.isConnected) { attachmentPreview.value = null; return; }
  const viewport = window.visualViewport;
  const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
  const topEdge = (viewport?.offsetTop ?? 0) + 12;
  const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 24;
  const bottomEdge = topEdge + (viewport?.height ?? innerHeight) - 24;
  const box = anchor.getBoundingClientRect();
  if (box.bottom < topEdge || box.top > bottomEdge) { attachmentPreview.value = null; return; }
  const above = box.top - topEdge - 12, below = bottomEdge - box.bottom - 12;
  side.value = above >= below ? 'above' : 'below';
  const available = Math.max(60, Math.max(above, below));
  panel.value.style.maxWidth = `${Math.min(600, rightEdge - leftEdge)}px`;
  panel.value.style.maxHeight = `${available}px`;
  // Offset sizes ignore the opening animation's transform.
  const width = panel.value.offsetWidth, height = panel.value.offsetHeight;
  const center = box.left + box.width / 2;
  const left = Math.max(leftEdge, Math.min(center - width / 2, rightEdge - width));
  const arrow = Math.max(16, Math.min(center - left, width - 16));
  position.value = {
    left: `${left}px`, top: `${side.value === 'above' ? box.top - 12 - height : box.bottom + 12}px`,
    maxWidth: `${Math.min(600, rightEdge - leftEdge)}px`, maxHeight: `${available}px`,
    '--arrow-x': `${arrow}px`, '--preview-origin': `${arrow}px ${side.value === 'above' ? '100%' : '0%'}`,
    '--preview-shift': side.value === 'above' ? '8px' : '-8px',
    '--preview-scale': `${Math.max(.45, Math.min(.9, box.width / Math.max(width, 1)))}`,
  };
}
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (!panel.value?.contains(target) && !attachmentPreview.value?.anchor?.contains(target)) attachmentPreview.value = null;
}
function escape(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape' || !attachmentPreview.value) return;
  event.preventDefault(); event.stopPropagation();
  const anchor = attachmentPreview.value.anchor;
  attachmentPreview.value = null;
  anchor?.focus({ preventScroll: true });
}
function untrack() {
  cancelAnimationFrame(frame); frame = 0; observer?.disconnect();
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', escape, true);
  window.removeEventListener('resize', schedule);
  window.removeEventListener('scroll', schedule, true);
  window.visualViewport?.removeEventListener('resize', schedule);
  window.visualViewport?.removeEventListener('scroll', schedule);
}
watch(attachmentPreview, async item => {
  untrack();
  if (!item) return;
  title.value = item.name || (item.kind === 'image' ? '图片预览' : '文本预览');
  await nextTick();
  if (attachmentPreview.value !== item) return;
  place(); observer = new ResizeObserver(schedule);
  if (panel.value) observer.observe(panel.value);
  if (item.anchor) observer.observe(item.anchor);
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
});
const text = ref('');
const image = ref('');
const loading = ref(false);
const error = ref('');
let controller: AbortController | undefined;
let ownedUrl: string | undefined;
function dispose() {
  controller?.abort();
  if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  ownedUrl = undefined;
}
watch(attachmentPreview, async item => {
  if (!item) { controller?.abort(); return; }
  dispose(); text.value = ''; image.value = ''; error.value = ''; loading.value = false;
  const request = new AbortController(); controller = request;
  if (item.kind === 'image') {
    image.value = item.bytes
      ? (ownedUrl = URL.createObjectURL(new Blob([item.bytes], { type: item.mime || 'image/png' })))
      : item.url || item.localUrl || '';
    return;
  }
  loading.value = true;
  try {
    let bytes = item.bytes;
    if (!bytes) {
      const response = await apiFetch(item.url || item.localUrl || '', { signal: request.signal });
      if (!response.ok) throw new Error(`无法读取附件（${response.status}）`);
      bytes = await response.arrayBuffer();
    }
    if (request.signal.aborted) return;
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\u0000-\u0008\u000e-\u001f]/.test(decoded)) throw new Error();
    } catch { throw new Error('暂不支持预览此文件，目前支持 UTF-8 文本。'); }
    text.value = decoded;
  } catch (cause) {
    if (!request.signal.aborted) error.value = (cause as Error).message || '预览加载失败';
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
});
onBeforeUnmount(() => { untrack(); dispose(); });
</script>
<template>
  <Teleport to="body">
    <Transition name="attachment-pop" @after-leave="dispose">
      <section v-if="attachmentPreview" ref="panel" id="attachment-preview" class="attachment-preview-pop" :class="side" :style="position" role="dialog" :aria-labelledby="attachmentPreview.kind === 'image' ? undefined : 'attachment-preview-title'" :aria-label="attachmentPreview.kind === 'image' ? title : undefined">
        <BubbleSurface :side="side === 'above' ? 'bottom' : 'top'" :tail-x="parseFloat(position['--arrow-x'] || '24')" />
        <header v-if="attachmentPreview.kind !== 'image'" id="attachment-preview-title">{{ title }}</header>
        <div class="attachment-preview-content">
          <p v-if="loading" role="status">正在加载…</p>
          <p v-else-if="error" role="alert">{{ error }}</p>
          <img v-else-if="image" :src="image" :alt="title" @load="schedule" @error="error = '图片加载失败'" />
          <div v-else-if="attachmentPreview.pastedText && attachmentPreview.editText" class="pasted-text-editor">
            <pre aria-hidden="true">{{ text + '\n' }}</pre>
            <textarea :value="text" :aria-label="title" spellcheck="false" @input="text = ($event.target as HTMLTextAreaElement).value; attachmentPreview?.editText?.(text); schedule()" />
          </div>
          <pre v-else>{{ text }}</pre>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>
<style scoped>
.attachment-preview-pop{--bubble-surface:var(--bg-raised);position:fixed;z-index:80;display:flex;flex-direction:column;width:max-content;max-width:min(600px,calc(100vw - 24px));max-height:70dvh;box-sizing:border-box;padding:14px 16px;background:transparent;border:1px solid transparent;border-radius:14px;isolation:isolate;transform-origin:var(--preview-origin)}
.attachment-preview-pop header{flex:none;font-size:14px;font-weight:600;margin-bottom:10px;overflow-wrap:anywhere}
.attachment-preview-content{min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain}
.attachment-preview-content img{display:block;max-width:100%;max-height:60dvh;object-fit:contain;margin:auto}
.attachment-preview-content pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--mono);font-size:calc(14px * var(--mono-scale));line-height:1.65}
.pasted-text-editor{display:grid;min-width:min(260px,calc(100vw - 58px))}
.pasted-text-editor pre,.pasted-text-editor textarea{grid-area:1/1;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--mono);font-size:calc(14px * var(--mono-scale));line-height:1.65;padding:0;margin:0;border:0}
.pasted-text-editor pre{visibility:hidden;pointer-events:none;min-height:3.3em}
.pasted-text-editor textarea{width:100%;height:100%;min-width:0;min-height:0;resize:none;overflow:hidden;background:transparent;color:inherit;outline:none;border-radius:0}
.attachment-preview-content p{margin:0;color:var(--fg-muted)}
.attachment-pop-enter-active,.attachment-pop-leave-active{transition:transform 180ms var(--ease-out),opacity 180ms var(--ease-out)}
.attachment-pop-enter-from,.attachment-pop-leave-to{opacity:0;transform:translateY(var(--preview-shift)) scale(var(--preview-scale))}
@media(prefers-reduced-motion:reduce){.attachment-pop-enter-active,.attachment-pop-leave-active{transition:none}}
</style>
