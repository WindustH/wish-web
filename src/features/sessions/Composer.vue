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

interface Img { name: string; mime: string; bytes: ArrayBuffer; localUrl: string }

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
const sizing = useComposerHeight(composerEl, props.mobile);
const height = computed(() => sizing.height());

const text = ref(chat.getDraft(props.sessionId));
const images = ref<Img[]>([]);
const sidRef = ref(props.sessionId);
sidRef.value = props.sessionId;

const running = computed(() => stream.value?.active);
const busy = computed(() => running.value || sending.value);
const canSend = computed(() => (text.value.trim().length > 0 || images.value.length > 0) && !busy.value);

const capsFailed = computed(() => caps.value?.status === 'error');
const capsData = computed(() => caps.value?.status === 'ok' ? caps.value.data : null);
const imageAllowed = computed(() => !capsData.value
  || capsData.value.input_modalities == null
  || (Array.isArray(capsData.value.input_modalities) && capsData.value.input_modalities.includes('image')));
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
  const prev = images.value;
  images.value = [];
  revokeAll(prev);
  text.value = chat.getDraft(id);
});
onBeforeUnmount(() => revokeAll(images.value));

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

async function attach() {
  if (!imageAllowed.value) { toast(i18n.t('chat.imageUnsupported')); return; }
  const owner = props.sessionId;
  const picked = await platform('fs').pickImages({ multiple: true });
  if (sidRef.value !== owner) return;
  const next = [...images.value];
  for (const p of picked) {
    if (allowedMimes.value && !allowedMimes.value.includes(p.mime)) { toast(i18n.t('chat.imageMime')); continue; }
    if (p.bytes.byteLength > maxImageBytes.value) { toast(i18n.t('chat.imageTooLarge')); continue; }
    if (next.length >= maxImages.value) break;
    next.push({ ...p, localUrl: URL.createObjectURL(new Blob([p.bytes], { type: p.mime })) });
  }
  images.value = next;
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

function onStop() { if (running.value && !sending.value) chat.interrupt(); }

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
  const up = (ev: PointerEvent) => {
    sizing.commit(h0 + y - ev.clientY);
    document.documentElement.classList.remove('resizing-composer');
    t.removeEventListener('pointermove', move);
    t.removeEventListener('pointerup', up);
    t.removeEventListener('pointercancel', cancel);
  };
  const cancel = (ev: PointerEvent) => { sizing.change(h0); up(ev); };
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
    :style="mobile ? undefined : { height: `${height}px` }">
    <div v-if="!mobile" class="composer-resize" role="separator" tabindex="0" aria-orientation="horizontal"
      :aria-label="i18n.t('composer.resize')" :aria-valuemin="sizing.min()" :aria-valuemax="sizing.max()"
      :aria-valuenow="height" :title="i18n.t('composer.resize')"
      @pointerdown="startComposerDrag" @keydown="resizeKeys" />
    <div v-if="!mobile" class="composer-toolbar">
      <button class="btn ghost icon-only" :title="i18n.t('chat.image')" :aria-label="i18n.t('chat.image')"
        :disabled="!imageAllowed" @click="attach"><Icon name="image" /></button>
      <div class="grow" />
      <button class="btn ghost icon-only" :title="i18n.t('chatbar.search')" :aria-label="i18n.t('chatbar.search')"
        @click="onSearch"><Icon name="history" /></button>
    </div>
    <div v-if="images.length > 0" class="attach-strip">
      <div v-for="(img, i) in images" :key="img.localUrl" class="attach-thumb">
        <img :src="img.localUrl" :alt="img.name" />
        <button class="rm" :aria-label="i18n.t('common.remove')" @click="removeImage(i)">
          <Icon name="x" class="sm" />
        </button>
      </div>
    </div>
    <div v-if="capsFailed" class="caps-error">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <div class="composer-editor">
      <button v-if="mobile" class="btn ghost icon-only" :title="i18n.t('chat.image')"
        :aria-label="i18n.t('chat.image')" :disabled="!imageAllowed" @click="attach"><Icon name="image" /></button>
      <textarea ref="ta" :rows="cfg.composer.mobileMinRows"
        :placeholder="running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')"
        :aria-label="i18n.t('chat.placeholder')" v-model="text"
        @input="setTextOwned(($event.target as HTMLTextAreaElement).value)" @keydown="onKeydown" />
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
