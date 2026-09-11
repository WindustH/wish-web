<script setup lang="ts">
// Correctness rules preserved from the audited implementation:
//  · IME-safe Enter (composition strokes never send);
//  · in-flight guard, no implicit stop from the keyboard;
//  · input NOT cleared while sending — only the exact sent payload on success;
//    stale receipts (session switched) never touch drafts/attachments;
//  · drafts per-session, persisted at the input event itself;
//  · object URLs revoked on remove/send/switch/unmount.
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue';
import { cfg } from '../../core/config.js';
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import { prefs } from '../../core/state/prefsSlice.js';
import { platform } from '../../platform/index.js';
import { toast } from '../../ui/toast.js';
import Icon from '../../ui/components/Icon.vue';
import { useComposerHeight } from './useComposerHeight.js';

interface ImageData { name: string; mime: string; bytes: ArrayBuffer }
interface Img extends ImageData { localUrl: string }

const props = defineProps<{ sessionId: string; mobile: boolean; onSearch: () => void }>();

const stream = ref(chat.stream.value);
const sending = ref(chat.sending.value);
const caps = ref(chat.capabilities.value);
watch(chat.stream, (v) => { stream.value = v; });
watch(chat.sending, (v) => { sending.value = v; });
watch(chat.capabilities, (v) => { caps.value = v; });
const sendOnEnter = computed(() => prefs.sendOnEnter.value);

const composerEl = ref<HTMLElement | null>(null);
const ta = ref<HTMLTextAreaElement | null>(null);
const sizing = useComposerHeight(composerEl);
const height = computed(() => sizing.height());
const attachmentStrip = ref<HTMLElement | null>(null);
const attachmentHeight = ref(0);
// Add previews to the preferred editor height without persisting that extra space.
watch(attachmentStrip, (el, _, onCleanup) => {
  attachmentHeight.value = el?.offsetHeight ?? 0;
  if (!el) return;
  const observer = new ResizeObserver(() => { attachmentHeight.value = el.offsetHeight; });
  observer.observe(el);
  onCleanup(() => observer.disconnect());
}, { flush: 'post' });

const text = ref(chat.getDraft(props.sessionId));
const images = ref<Img[]>([]);
const readingImages = ref(0);
let attachmentEpoch = 0;
const sidRef = ref(props.sessionId);
sidRef.value = props.sessionId;

const running = computed(() => stream.value?.active);
const busy = computed(() => running.value || sending.value);
const canSend = computed(() => (text.value.trim().length > 0 || images.value.length > 0) && !busy.value && !readingImages.value);

const capsFailed = computed(() => caps.value?.status === 'error');
const capsData = computed(() => caps.value?.status === 'ok' ? caps.value.data : null);
const maxImages = computed(() => capsData.value?.images?.max_images_per_message ?? cfg.composer.maxImages);
const maxImageBytes = computed(() => capsData.value?.images?.max_image_bytes ?? cfg.composer.maxImageBytes);
const allowedMimes = computed(() => {
  const l = capsData.value?.images?.allowed_mime_types;
  return Array.isArray(l) && l.length ? l : null;
});

const revokeAll = (imgs: Img[]) => { for (const i of imgs) if (i?.localUrl) URL.revokeObjectURL(i.localUrl); };

function setTextOwned(v: string) {
  text.value = v;
  chat.setDraft(v, sidRef.value);
}

watch(() => props.sessionId, (id) => {
  attachmentEpoch++;
  readingImages.value = 0;
  sidRef.value = id;   // ownership FIRST: drafts/attachments must never leak across sessions (audit A1)
  const prev = images.value;
  images.value = [];
  revokeAll(prev);
  text.value = chat.getDraft(id);
}, { flush: 'sync' });
onBeforeUnmount(() => { attachmentEpoch++; revokeAll(images.value); });

watch([text, () => props.mobile], async () => {
  await nextTick();
  const el = ta.value;
  if (!el) return;
  if (!props.mobile) { el.style.height = ''; el.style.overflowY = 'auto'; return; }
  el.style.height = 'auto';
  const style = getComputedStyle(el);
  const lineH = parseFloat(style.lineHeight);
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const maxPx = Math.min(lineH * cfg.composer.mobileMaxRows + padding,
    window.innerHeight * cfg.composer.mobileMaxHeightVh);
  el.style.height = Math.min(el.scrollHeight, maxPx) + 'px';
  el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
});

function imageAccepted(mime: string, size: number) {
  if (allowedMimes.value && !allowedMimes.value.includes(mime)) { toast(i18n.t('chat.imageMime')); return false; }
  if (size > maxImageBytes.value) { toast(i18n.t('chat.imageTooLarge')); return false; }
  if (images.value.length >= maxImages.value) { toast(i18n.t('chat.imageLimit', { count: maxImages.value })); return false; }
  return true;
}
function addImage(image: ImageData) {
  if (!imageAccepted(image.mime, image.bytes.byteLength)) return;
  images.value = [...images.value, { ...image, localUrl: URL.createObjectURL(new Blob([image.bytes], { type: image.mime })) }];
}
async function attach() {
  const epoch = attachmentEpoch;
  try {
    const picked = await platform('fs').pickImages({ multiple: true });
    if (epoch !== attachmentEpoch) return;
    for (const image of picked) addImage(image);
  } catch (error) {
    if (epoch === attachmentEpoch) toast(i18n.t('chat.imageReadFailed') + ': ' + String(error));
  }
}
function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  // Preserve native text insertion (selection, undo, IME) for mixed clipboards.
  // Clipboard events also work over LAN HTTP; no clipboard-read permission is needed.
  if (!event.clipboardData?.getData('text/plain')) event.preventDefault();
  void pasteImages(files);
}
async function pasteImages(files: File[]) {
  const epoch = attachmentEpoch;
  readingImages.value++;
  try {
    for (const file of files) {
      if (epoch !== attachmentEpoch) return;
      if (!imageAccepted(file.type, file.size)) continue;
      const bytes = await file.arrayBuffer();
      if (epoch !== attachmentEpoch) return;
      addImage({ name: file.name, mime: file.type, bytes });
    }
  } catch (error) {
    if (epoch === attachmentEpoch) toast(i18n.t('chat.imageReadFailed') + ': ' + String(error));
  } finally {
    if (epoch === attachmentEpoch) readingImages.value--;
  }
}

function removeImage(i: number) {
  const img = images.value[i];
  if (img?.localUrl) URL.revokeObjectURL(img.localUrl);
  images.value = images.value.filter((_, j) => j !== i);
}

async function submit() {
  if (sending.value || running.value) return;
  if (!canSend.value) return;
  const owner = props.sessionId;
  const payload = text.value, imgs = images.value;
  try {
    const receipt = await chat.send(payload, imgs);
    if (!receipt) return;   // stale: never accepted — everything survives
    if (sidRef.value !== owner) { chat.setDraft('', owner); revokeAll(imgs); return; }
    if (text.value === payload) { text.value = ''; chat.setDraft('', owner); }
    images.value = images.value.filter((i) => !imgs.includes(i));
    revokeAll(imgs);
  } catch (e: any) {
    if (sidRef.value === owner) toast(String(e?.detail || e?.message || e));
  }
}

async function onStop() {
  if (!running.value || sending.value) return;
  try { await chat.interrupt(); }
  catch (e: any) { toast(i18n.t('chat.stopFailed') + ': ' + String(e?.detail || e?.message || e)); }
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return;
  if (props.mobile) return;
  if (e.key !== 'Enter') return;
  const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
  const mod = e.ctrlKey || e.metaKey;
  if ((sendOnEnter.value && plain) || (!sendOnEnter.value && mod)) {
    if (!running.value && !sending.value) { e.preventDefault(); submit(); }
  }
}

function startComposerDrag(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  const t = e.currentTarget as HTMLElement;
  t.setPointerCapture(e.pointerId);
  const y = e.clientY, h0 = height.value;
  document.documentElement.classList.add('resizing-composer');
  const move = (ev: PointerEvent) => sizing.change(h0 + y - ev.clientY);
  const finish = (nextHeight: number) => {
    sizing.commit(nextHeight);
    document.documentElement.classList.remove('resizing-composer');
    t.removeEventListener('pointermove', move);
    t.removeEventListener('pointerup', up);
    t.removeEventListener('pointercancel', cancel);
  };
  const up = (ev: PointerEvent) => finish(h0 + y - ev.clientY);
  const cancel = () => finish(h0);
  t.addEventListener('pointermove', move);
  t.addEventListener('pointerup', up);
  t.addEventListener('pointercancel', cancel);
}

function resizeKeys(e: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  sizing.commit(e.key === 'Home' ? sizing.min() : e.key === 'End' ? sizing.max()
    : height.value + (e.key === 'ArrowUp' ? 1 : -1) * cfg.composer.resizeStep);
}
</script>

<template>
  <div ref="composerEl" class="composer" :class="mobile ? 'mobile' : 'desktop'"
    :style="mobile ? undefined : { height: `${Math.min(sizing.max(), height + attachmentHeight)}px` }">
    <div v-if="!mobile" class="composer-resize" role="separator" tabindex="0" aria-orientation="horizontal"
      :aria-label="i18n.t('composer.resize')" :aria-valuemin="sizing.min()" :aria-valuemax="sizing.max()"
      :aria-valuenow="height" :title="i18n.t('composer.resize')"
      @pointerdown="startComposerDrag" @keydown="resizeKeys" />
    <div v-if="!mobile" class="composer-toolbar">
      <button class="btn ghost icon-only" :title="i18n.t('chat.image')" :aria-label="i18n.t('chat.image')"
        @click="attach"><Icon name="image" /></button>
      <div class="grow" />
      <button class="btn ghost icon-only" :title="i18n.t('chatbar.search')" :aria-label="i18n.t('chatbar.search')"
        @click="onSearch"><Icon name="history" /></button>
    </div>
    <div v-if="images.length > 0" ref="attachmentStrip" class="attachment-preview">
      <div class="attach-strip">
      <div v-for="(img, i) in images" :key="img.localUrl" class="attach-thumb">
        <img :src="img.localUrl" :alt="img.name" />
        <button class="rm" :aria-label="i18n.t('common.remove')" @click="removeImage(i)">
          <Icon name="x" class="sm" />
        </button>
      </div>
    </div>
    </div>
    <div v-if="capsFailed" class="caps-error">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <div class="composer-editor">
      <button v-if="mobile" class="btn ghost icon-only" :title="i18n.t('chat.image')"
        :aria-label="i18n.t('chat.image')" @click="attach"><Icon name="image" /></button>
      <textarea ref="ta" :rows="cfg.composer.mobileMinRows"
        :placeholder="running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')"
        :aria-label="i18n.t('chat.placeholder')" v-model="text"
        @input="setTextOwned(($event.target as HTMLTextAreaElement).value)" @keydown="onKeydown" @paste="onPaste" />
      <button v-if="mobile" class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
        :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')" :title="i18n.t(running ? 'chat.stop' : 'chat.send')"
        @click="running ? onStop() : submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" />
        {{ i18n.t(running ? 'chat.stop' : 'chat.send') }}
      </button>
    </div>
    <div v-if="!mobile" class="composer-footer">
      <span class="composer-hint">{{ i18n.t(sendOnEnter ? 'composer.enterSends' : 'composer.modEnterSends') }}</span>
      <button class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
        :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')" :title="i18n.t(running ? 'chat.stop' : 'chat.send')"
        @click="running ? onStop() : submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" />
        {{ i18n.t(running ? 'chat.stop' : 'chat.send') }}
      </button>
    </div>
  </div>
</template>
