<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
import { attachmentLimits, hasImagePreview, type AttachmentInput, type PickedAttachment } from '../../core/attachments.js';
import { fmtBytes } from '../../core/util/fmt.js';
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

interface Attachment extends AttachmentInput { localUrl: string }

const props = defineProps<{ sessionId: string; mobile: boolean; onSearch?: () => void;
  start?: boolean; disabled?: boolean; sendMessage?: (text: string, attachments: AttachmentInput[]) => Promise<string> }>();
const submitting = ref(false);

const stream = computed(() => props.start ? null : chat.stream.value);
const sending = computed(() => submitting.value || (!props.start && chat.sending.value));
const caps = computed(() => props.start ? null : chat.capabilities.value);
const sendOnEnter = computed(() => prefs.sendOnEnter.value);

const composerEl = ref<HTMLElement | null>(null);
const ta = ref<HTMLTextAreaElement | null>(null);
defineExpose({ focus: () => ta.value?.focus() });
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
const attachments = ref<Attachment[]>([]);
const readingAttachments = ref(0);
let attachmentEpoch = 0;
const sidRef = ref(props.sessionId);
sidRef.value = props.sessionId;

const running = computed(() => stream.value?.active);
const busy = computed(() => running.value || sending.value);
const canSend = computed(() => (text.value.trim().length > 0 || attachments.value.length > 0) && !busy.value && !readingAttachments.value && !props.disabled);

const capsFailed = computed(() => caps.value?.status === 'error');
const capsData = computed(() => caps.value?.status === 'ok' ? caps.value.data : null);
const limits = computed(() => attachmentLimits(capsData.value));

const revokeAll = (items: Attachment[]) => { for (const i of items) if (i?.localUrl) URL.revokeObjectURL(i.localUrl); };

function setTextOwned(v: string) {
  text.value = v;
  chat.setDraft(v, sidRef.value);
}

watch(() => props.sessionId, (id) => {
  attachmentEpoch++;
  readingAttachments.value = 0;
  sidRef.value = id;   // ownership FIRST: drafts/attachments must never leak across sessions (audit A1)
  const prev = attachments.value;
  attachments.value = [];
  revokeAll(prev);
  text.value = chat.getDraft(id);
}, { flush: 'sync' });
onBeforeUnmount(() => { attachmentEpoch++; revokeAll(attachments.value); });

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

function attachmentAccepted(file: PickedAttachment) {
  const image = hasImagePreview(file.mime);
  const bytes = image ? limits.value.imageBytes : limits.value.fileBytes;
  if (file.size > bytes) { toast(`Attachment exceeds size limit (${fmtBytes(bytes)})`); return false; }
  return hasAttachmentSpace(file.mime);
}
function hasAttachmentSpace(mime: string) {
  const image = hasImagePreview(mime);
  const count = image ? limits.value.imageCount : limits.value.fileCount;
  if (attachments.value.filter(item => hasImagePreview(item.mime) === image).length >= count) {
    toast(`Too many ${image ? 'images' : 'files'} (limit: ${count})`); return false;
  }
  return true;
}
async function attach() {
  const epoch = attachmentEpoch;
  try {
    const picked = await platform('fs').pickFiles({ multiple: true });
    if (epoch !== attachmentEpoch) return;
    await readAttachments(picked);
  } catch (error) {
    if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
  }
}
function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  // Preserve native text insertion (selection, undo, IME) for mixed clipboards.
  if (!event.clipboardData?.getData('text/plain')) event.preventDefault();
  void readAttachments(files.map(file => ({
    // Clipboard image names are synthesized by the browser, not source names.
    name: file.type.startsWith('image/') ? undefined : file.name || undefined,
    mime: file.type || 'application/octet-stream', size: file.size,
    read: () => file.arrayBuffer(),
  })));
}
async function readAttachments(files: PickedAttachment[]) {
  const epoch = attachmentEpoch;
  readingAttachments.value++;
  try {
    for (const file of files) {
      if (epoch !== attachmentEpoch) return;
      if (!attachmentAccepted(file)) continue;
      const bytes = await file.read();
      if (epoch !== attachmentEpoch) return;
      if (!hasAttachmentSpace(file.mime)) continue;
      attachments.value = [...attachments.value, {
        name: file.name, mime: file.mime, bytes,
        localUrl: URL.createObjectURL(new Blob([bytes], { type: file.mime })),
      }];
    }
  } catch (error) {
    if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
  } finally {
    if (epoch === attachmentEpoch) readingAttachments.value--;
  }
}

function removeAttachment(i: number) {
  const attachment = attachments.value[i];
  if (attachment?.localUrl) URL.revokeObjectURL(attachment.localUrl);
  attachments.value = attachments.value.filter((_, j) => j !== i);
}

async function submit() {
  if (sending.value || running.value) return;
  if (!canSend.value) return;
  const owner = props.sessionId;
  const payload = text.value, sent = attachments.value;
  submitting.value = true;
  try {
    const receipt = await (props.sendMessage ? props.sendMessage(payload, sent) : chat.send(payload, sent));
    if (!receipt) return;   // stale: never accepted — everything survives
    if (sidRef.value !== owner) { chat.setDraft('', owner); revokeAll(sent); return; }
    if (text.value === payload) { text.value = ''; chat.setDraft('', owner); }
    attachments.value = attachments.value.filter((i) => !sent.includes(i));
    revokeAll(sent);
  } catch (e: any) {
    if (sidRef.value === owner) toast(String(e?.detail || e?.message || e));
  } finally { submitting.value = false; }
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
  <div ref="composerEl" class="composer" :class="[mobile ? 'mobile' : 'desktop', { 'composer-start': start }]"
    :style="mobile || start ? undefined : { height: `${Math.min(sizing.max(), height + attachmentHeight)}px` }">
    <Hint :text="i18n.t('composer.resize')" v-if="!mobile && !start"><div class="composer-resize" role="separator" tabindex="0" aria-orientation="horizontal"
      :aria-label="i18n.t('composer.resize')" :aria-valuemin="sizing.min()" :aria-valuemax="sizing.max()"
      :aria-valuenow="height"
      @pointerdown="startComposerDrag" @keydown="resizeKeys" /></Hint>
    <div v-if="!mobile" class="composer-toolbar">
      <Hint :text="i18n.t('chat.attach')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.attach')"
        @click="attach"><Icon name="paperclip" /></button></Hint>
      <slot name="selection" />
      <div class="grow" />
      <Hint :text="i18n.t('chatbar.search')" v-if="onSearch"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.search')"
        @click="onSearch"><Icon name="history" /></button></Hint>
    </div>
    <div v-if="attachments.length > 0" ref="attachmentStrip" class="attachment-preview">
      <div class="attach-strip">
      <div v-for="(img, i) in attachments" :key="img.localUrl" class="attach-thumb">
        <Hint v-if="hasImagePreview(img.mime)" :text="img.name"><img :src="img.localUrl" :alt="img.name || i18n.t('chat.image')" /></Hint>
        <div v-else class="attachment-file"><Icon name="paperclip" /><div class="attachment-file-label"><span>{{ img.name || i18n.t('chat.attachment') }}</span><small>{{ fmtBytes(img.bytes.byteLength) }}</small></div></div>
        <button class="rm" :aria-label="i18n.t('common.remove')" @click="removeAttachment(i)">
          <Icon name="x" class="sm" />
        </button>
      </div>
    </div>
    </div>
    <div v-if="capsFailed" class="caps-error">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-if="mobile && start" class="composer-start-selection"><slot name="selection" /></div>
    <div class="composer-editor">
      <Hint :text="i18n.t('chat.attach')" v-if="mobile"><button class="btn ghost icon-only"
        :aria-label="i18n.t('chat.attach')" @click="attach"><Icon name="paperclip" /></button></Hint>
      <textarea ref="ta" :rows="cfg.composer.mobileMinRows"
        :placeholder="running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')"
        :aria-label="i18n.t('chat.placeholder')" v-model="text"
        @input="setTextOwned(($event.target as HTMLTextAreaElement).value)" @keydown="onKeydown" @paste="onPaste" />
      <Hint :text="i18n.t(running ? 'chat.stop' : 'chat.send')" v-if="mobile"><button class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
        :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')"
        @click="running ? onStop() : submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" />
        {{ i18n.t(running ? 'chat.stop' : 'chat.send') }}
      </button></Hint>
    </div>
    <div v-if="!mobile" class="composer-footer">
      <span class="composer-hint">{{ i18n.t(sendOnEnter ? 'composer.enterSends' : 'composer.modEnterSends') }}</span>
      <Hint :text="i18n.t(running ? 'chat.stop' : 'chat.send')"><button class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
        :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')"
        @click="running ? onStop() : submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" />
        {{ i18n.t(running ? 'chat.stop' : 'chat.send') }}
      </button></Hint>
    </div>
  </div>
</template>
