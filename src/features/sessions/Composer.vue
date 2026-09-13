<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
import { attachmentDraftsFor, attachmentLimits, hasImagePreview, saveAttachmentDrafts, type AttachmentInput, type PickedAttachment } from '../../core/attachments.js';
import { fmtBytes } from '../../core/util/fmt.js';
// Correctness rules preserved from the audited implementation:
//  · IME-safe Enter (composition strokes never send);
//  · in-flight guard, no implicit stop from the keyboard;
//  · input NOT cleared while sending — only the exact sent payload on success;
//    stale receipts (session switched) never touch drafts/attachments;
//  · drafts per-session — text persisted at the input event itself,
//    attachments mirrored to the per-session draft store in
//    core/attachments.js — both restored on session switch and return;
//  · object URLs revoked when an attachment leaves for good (remove/send).
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue';
import { cfg } from '../../core/config.js';
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import { blobUrl } from '../../core/api/endpoints.js';
import { prefs } from '../../core/state/prefsSlice.js';
import { platform } from '../../platform/index.js';
import { toast } from '../../ui/toast.js';
import Icon from '../../ui/components/Icon.vue';
import { useComposerHeight } from './useComposerHeight.js';

interface Attachment extends AttachmentInput { localUrl: string }

const props = defineProps<{ sessionId: string; mobile: boolean;
  start?: boolean; disabled?: boolean; sendMessage?: (text: string, attachments: AttachmentInput[]) => Promise<string> }>();
const submitting = ref(false);

const stream = computed(() => props.start ? null : chat.stream.value);
const sending = computed(() => submitting.value || (!props.start && chat.sending.value));
const caps = computed(() => props.start ? null : chat.capabilities.value);
const sendOnEnter = computed(() => prefs.sendOnEnter.value);

const composerEl = ref<HTMLElement | null>(null);
const ta = ref<HTMLTextAreaElement | null>(null);
function fill(v: string, attachments?: any[]) {
  setTextOwned(v);
  void nextTick(() => ta.value?.focus());
  if (attachments?.length) void refillAttachments(attachments);
}

// Re-attach a queued message's attachments: the delivery projection carries
// each item's blob id, so the bytes are re-downloaded from the blob store
// and become ordinary draft attachments again (space-checked like a pick).
async function refillAttachments(items: any[]) {
  const epoch = attachmentEpoch;
  for (const item of items) {
    try {
      const response = await fetch(blobUrl(item.blob_id));
      if (!response.ok) throw new Error(`blob ${item.blob_id}: ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (epoch !== attachmentEpoch || !hasAttachmentSpace(item.kind)) continue;
      attachments.value = [...attachments.value, {
        kind: item.kind, name: item.filename, mime: item.mime_type, bytes,
        localUrl: URL.createObjectURL(new Blob([bytes], { type: item.mime_type })),
      }];
      saveAttachmentDrafts(sidRef.value, attachments.value);
    } catch (error) {
      toast('Could not restore attachment: ' + String((error as Error)?.message ?? error));
    }
  }
}
defineExpose({ focus: () => ta.value?.focus(), fill });
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
const attachments = ref<Attachment[]>(attachmentDraftsFor<Attachment>(props.sessionId));
const readingAttachments = ref(0);
let attachmentEpoch = 0;
const sidRef = ref(props.sessionId);
sidRef.value = props.sessionId;

const running = computed(() => stream.value?.active);
// A running loop no longer blocks sending: the message queues and is
// consumed at the next turn boundary (see chatSlice.send).
const canSend = computed(() => (text.value.trim().length > 0 || attachments.value.length > 0) && !sending.value && !readingAttachments.value && !props.disabled);
// While running, the round button stays the stop control; a separate send
// appears as soon as there is something to queue.
const queueable = computed(() => running.value && (text.value.trim().length > 0 || attachments.value.length > 0));

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
  saveAttachmentDrafts(sidRef.value, attachments.value);   // this conversation keeps its unsent draft
  sidRef.value = id;   // ownership FIRST: drafts/attachments must never leak across sessions (audit A1)
  attachments.value = attachmentDraftsFor<Attachment>(id);   // …and the target's draft comes back
  text.value = chat.getDraft(id);
}, { flush: 'sync' });
// Unmount keeps the stored draft (and its object URLs) alive for the return
// visit; revoking here would break the restored preview.
onBeforeUnmount(() => { attachmentEpoch++; });

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
  const image = file.kind === 'image';
  const bytes = image ? limits.value.imageBytes : limits.value.fileBytes;
  if (file.size > bytes) { toast(`Attachment exceeds size limit (${fmtBytes(bytes)})`); return false; }
  return hasAttachmentSpace(file.kind);
}
function hasAttachmentSpace(kind: 'image' | 'file') {
  const image = kind === 'image';
  const count = image ? limits.value.imageCount : limits.value.fileCount;
  if (attachments.value.filter(item => item.kind === kind).length >= count) {
    toast(`Too many ${image ? 'images' : 'files'} (limit: ${count})`); return false;
  }
  return true;
}
async function attach(kind: 'image' | 'file') {
  const epoch = attachmentEpoch;
  try {
    const picked = await platform('fs').pickFiles({ multiple: true, accept: kind === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : '' });
    if (epoch !== attachmentEpoch) return;
    await readAttachments(picked.map((file: Omit<PickedAttachment, 'kind'>) => ({ ...file, kind })));
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
    kind: hasImagePreview(file.type) ? 'image' as const : 'file' as const,
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
      if (!hasAttachmentSpace(file.kind)) continue;
      attachments.value = [...attachments.value, {
        kind: file.kind, name: file.name, mime: file.mime, bytes,
        localUrl: URL.createObjectURL(new Blob([bytes], { type: file.mime })),
      }];
      saveAttachmentDrafts(sidRef.value, attachments.value);
    }
  } catch (error) {
    if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
  } finally {
    // Balanced against this call's increment even when a session switch
    // abandoned the read (epoch moved): the counter guards THIS composer's
    // in-flight reads, not any particular session.
    readingAttachments.value--;
  }
}

function removeAttachment(i: number) {
  const attachment = attachments.value[i];
  if (attachment?.localUrl) URL.revokeObjectURL(attachment.localUrl);
  attachments.value = attachments.value.filter((_, j) => j !== i);
  saveAttachmentDrafts(sidRef.value, attachments.value);
}

async function submit() {
  if (sending.value) return;
  if (!canSend.value) return;
  const owner = props.sessionId;
  const payload = text.value, sent = attachments.value;
  submitting.value = true;
  try {
    const receipt = await (props.sendMessage ? props.sendMessage(payload, sent) : chat.send(payload, sent));
    if (!receipt) return;   // stale: never accepted — everything survives
    if (sidRef.value !== owner) {
      chat.setDraft('', owner);
      saveAttachmentDrafts(owner, attachmentDraftsFor<Attachment>(owner).filter((i) => !sent.includes(i)));
      revokeAll(sent);
      return;
    }
    if (text.value === payload) { text.value = ''; chat.setDraft('', owner); }
    attachments.value = attachments.value.filter((i) => !sent.includes(i));
    saveAttachmentDrafts(owner, attachments.value);
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
    if (!sending.value) { e.preventDefault(); submit(); }
  }
}

function startComposerDrag(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  const t = e.currentTarget as HTMLElement;
  t.setPointerCapture(e.pointerId);
  const y = e.clientY, h0 = height.value;
  document.documentElement.classList.add('resizing-composer');
  const heightAt = (ev: PointerEvent) => h0 + y - ev.clientY;

  // Drag end listens on window: the handle can lose pointer capture (the
  // composer re-renders mid-drag while a run streams) or leave the document,
  // and a pointerup delivered anywhere else would leave `resizing-composer`
  // on <html>, where its user-select: none makes the whole page look frozen.
  // A release outside the window delivers no pointerup at all, so the next
  // move with the button already up ends the drag too (same recovery as the
  // session-list edge). pointercancel keeps reverting to the pre-drag height;
  // the class comes off before commit so a storage failure cannot strand it.
  function release(ev: PointerEvent, commitHeight: number) {
    if (ev.pointerId !== e.pointerId) return;
    document.documentElement.classList.remove('resizing-composer');
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    sizing.commit(commitHeight);
  }
  function up(ev: PointerEvent) { release(ev, heightAt(ev)); }
  function cancel(ev: PointerEvent) { release(ev, h0); }
  function move(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    if (!(ev.buttons & 1)) { up(ev); return; }
    sizing.change(heightAt(ev));
  }
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
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
      <Hint :text="i18n.t('chat.image')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.image')"
        @click="attach('image')"><Icon name="image" /></button></Hint>
      <Hint :text="i18n.t('chat.attach')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.attach')"
        @click="attach('file')"><Icon name="paperclip" /></button></Hint>
      <slot name="selection" />
      <div class="grow" />
    </div>
    <div v-if="attachments.length > 0" ref="attachmentStrip" class="attachment-preview">
      <div class="attach-strip">
      <div v-for="(img, i) in attachments" :key="img.localUrl" class="attach-thumb">
        <Hint v-if="img.kind === 'image'" :text="img.name"><img :src="img.localUrl" :alt="img.name || i18n.t('chat.image')" /></Hint>
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
    <div v-if="mobile" class="composer-mobile-actions">
      <Hint :text="i18n.t('chat.image')"><button class="btn ghost icon-only"
        :aria-label="i18n.t('chat.image')" @click="attach('image')"><Icon name="image" /></button></Hint>
      <Hint :text="i18n.t('chat.attach')"><button class="btn ghost icon-only"
        :aria-label="i18n.t('chat.attach')" @click="attach('file')"><Icon name="paperclip" /></button></Hint>
      <div v-if="start" class="composer-start-selection"><slot name="selection" /></div>
      <div v-else class="grow" />

    </div>
    <div class="composer-editor">
      <textarea ref="ta" :rows="cfg.composer.mobileMinRows"
        :placeholder="running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')"
        :aria-label="i18n.t('chat.placeholder')" v-model="text"
        @input="setTextOwned(($event.target as HTMLTextAreaElement).value)" @keydown="onKeydown" @paste="onPaste" />
      <Hint v-if="mobile && queueable" :text="i18n.t('chat.queueSend')"><button class="send-btn" :disabled="sending"
        :aria-label="i18n.t('chat.queueSend')" @click="submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" /><Icon v-else name="send" />
      </button></Hint>
      <Hint v-if="mobile" :text="i18n.t(running ? 'chat.stop' : 'chat.send')"><button class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
        :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')"
        @click="running ? onStop() : submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" />
        <Icon v-else :name="running ? 'square' : 'send'" />
      </button></Hint>
    </div>
    <div v-if="!mobile" class="composer-footer">
      <span class="composer-hint">{{ i18n.t(sendOnEnter ? 'composer.enterSends' : 'composer.modEnterSends') }}</span>
      <Hint v-if="queueable" :text="i18n.t('chat.queueSend')"><button class="send-btn" :disabled="sending"
        :aria-label="i18n.t('chat.queueSend')" @click="submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" /><Icon v-else name="send" />
      </button></Hint>
      <Hint :text="i18n.t(running ? 'chat.stop' : 'chat.send')"><button class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
        :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')"
        @click="running ? onStop() : submit()">
        <Icon v-if="sending" name="loader-circle" class="spin" />
        <Icon v-else :name="running ? 'square' : 'send'" />
      </button></Hint>
    </div>
  </div>
</template>
