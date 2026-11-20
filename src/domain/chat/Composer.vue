<script setup lang="ts">
import { useOpenImage } from '../media/useOpenImage.ts';
import { inject } from 'vue';
import type { QueuedAttachment } from '../../core/api/types.ts';
import { replyContextKey } from '../references/context.ts';
import { referenceDescription, type ReplyReference } from '../../core/replyReferences.ts';
import { interruptReply } from './interruptReply.ts';
import { historyPage, blobUrl } from '../../core/api/endpoints.ts';
import { cfg } from '../../core/config.ts';
import {
  createPromptHistory,
  sessionPrompts,
  type HistoricalPrompt,
  type HistoricalAttachment,
} from './promptHistory.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
const errorDetail = (error: unknown) => describeError(error).message;
import { attachmentPreview, previewAttachment } from '../../ui/attachmentPreview.ts';
import { attachmentDigest } from '../../core/attachmentDigest.ts';
import { expandPastedText } from '../../core/pastedText.ts';
import InlineMessageEditor from './InlineMessageEditor.vue';
import { attachmentsForMessage } from '../../core/attachmentPlaceholders.ts';
import Hint from '../../ui/components/Hint.vue';
import {
  attachmentDraftsFor,
  attachmentLimits,
  type StoredAttachmentReference,
  saveAttachmentDrafts,
  type AttachmentInput,
} from '../../core/attachments.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import { useComposerAttachments, type Attachment } from './useComposerAttachments.ts';
import { tr } from '../../core/i18n/tr.ts';
import { isSendKey } from '../../ui/sendKey.ts';
import ComposerSendButtons from './ComposerSendButtons.vue';
import Menu from '../../ui/components/Menu.vue';
import type { MenuItem } from '../../ui/components/menuTypes.ts';
import ComposerAttachmentTray from './ComposerAttachmentTray.vue';
import { useAutoGrow } from './useAutoGrow.ts';
import './composerIsland.css';

const props = defineProps<{
  /** Whose drafts these are: the open session's id or the start page's own key. */
  owner: string;
  mobile: boolean;
  mobileActions?: MenuItem[];
  /** The start page's composer, laid out larger with its send button in a footer. */
  start?: boolean;
  disabled?: boolean;
  /** Where the message goes when starting a new session. */
  sendMessage?: (text: string, attachments: AttachmentInput[]) => Promise<string>;
}>();

const emit = defineEmits<{ mobileAction: [key: string] }>();
const mobileMenuItems = computed<MenuItem[]>(() => [
  { key: 'image', icon: 'image', label: i18n.t('chat.image') },
  { key: 'file', icon: 'paperclip', label: i18n.t('chat.attachment') },
  ...(props.mobileActions ?? []),
]);
function mobileAction(key: string) {
  if (key === 'image' || key === 'file') {
    const insertion = ta.value?.createInsertion();
    void attach(key, (token) => insertion?.insert(token)).finally(() => insertion?.dispose());
  } else emit('mobileAction', key);
}

// Writing to the open session: the composer follows its run, can stop it and ask it aside.
const live = computed(() => !props.sendMessage);
const submitting = ref(false);
const stream = computed(() => (live.value ? chat.stream.value : null));
const sending = computed(() => submitting.value || (live.value && chat.sending.value));
const caps = computed(() => (live.value ? chat.capabilities.value : null));
const sendOnEnter = computed(() => prefs.sendOnEnter.value);

const composerEl = ref<HTMLElement | null>(null);
const ta = ref<InstanceType<typeof InlineMessageEditor> | null>(null);
function focusComposerBlank(event: MouseEvent) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.matches('.composer, .composer-editor, .composer-toolbar, .composer-footer, .composer-mobile-actions, .grow')
  ) {
    ta.value?.focus();
  }
}

function fill(v: string, attachmentsToFill?: QueuedAttachment[]) {
  resetPromptHistory();
  setTextOwned(v);
  void nextTick(() => ta.value?.focus());
  void refillAttachments(attachmentsToFill ?? []);
}

async function mention(reference: StoredAttachmentReference) {
  if (reference.owner !== props.owner) return;
  await nextTick();
  const insertion = ta.value?.createInsertion();
  try {
    await referenceAttachment(reference, (token) => insertion?.insert(token));
    if (reference.owner === props.owner) await nextTick(() => ta.value?.focus());
  } finally {
    insertion?.dispose();
  }
}
const replies = inject(replyContextKey, undefined);
async function reference(reference: ReplyReference, image?: Blob) {
  if (reference.session !== props.owner || !live.value) return;
  if (attachments.value.filter((a) => a.reply).length >= 8 || reference.text.length > 16000) {
    toast(tr('引用过多或选区过长，请缩小范围', 'Too many references or selection too long'), { tone: 'warning' });
    return;
  }
  const owner = props.owner;
  if (
    image &&
    (image.size > limits.value.imageBytes ||
      attachments.value.filter((a) => a.kind === 'image').length >= limits.value.imageCount)
  ) {
    toast(tr('选区图片超过附件限制', 'Selected image exceeds attachment limits'), { tone: 'warning' });
    return;
  }
  const bytes = image ? await image.arrayBuffer() : new ArrayBuffer(0);
  if (owner !== props.owner || !live.value) return;
  if (image) reference = { ...reference, imageId: await attachmentDigest(bytes) };
  if (owner !== props.owner || !live.value) return;
  if (image && attachments.value.filter((a) => a.kind === 'image').length >= limits.value.imageCount) {
    toast(tr('选区图片超过附件限制', 'Selected image exceeds attachment limits'), { tone: 'warning' });
    return;
  }
  const placeholder = `<reply-${reference.id}>`;
  attachments.value.push({
    reply: reference,
    kind: image ? 'image' : 'file',
    name: reference.label,
    mime: image?.type ?? 'text/plain',
    bytes,
    localUrl: image ? URL.createObjectURL(image) : '',
    placeholder,
  });
  saveAttachmentDrafts(owner, attachments.value);
  await nextTick();
  const insertion = ta.value?.createInsertion();
  insertion?.insert(placeholder);
  insertion?.dispose();
  ta.value?.focus();
}
function locateReference(token: string) {
  const ref = attachments.value.find((a) => a.placeholder === token)?.reply;
  if (ref) replies?.locate(ref);
}
defineExpose({ focus: () => ta.value?.focus(), fill, mention, reference });

const capsFailed = computed(() => caps.value?.status === 'error');
const capsData = computed(() => (caps.value?.status === 'ok' ? caps.value.data : null));
const limits = computed(() => attachmentLimits(capsData.value));

// Attachments management
const {
  attachments,
  readingAttachments,
  attachmentsOwnerId,
  attach,
  onPaste,
  removeAttachment: discardAttachment,
  refillAttachments,
  referenceAttachment,
  replaceAttachments,
  syncAttachmentTags,
  clearAttachmentUndo,
  revokeAll,
} = useComposerAttachments(
  computed(() => props.owner),
  limits,
);

const text = ref(chat.getDraft(props.owner));
type PromptDraft = { text: string; attachments: AttachmentInput[] } | HistoricalPrompt;
type PromptHistoryState = {
  navigation: ReturnType<typeof createPromptHistory<PromptDraft>>;
  before?: number;
  hasMore: boolean;
};
const promptHistories = new Map<string, PromptHistoryState>();
function historyFor(owner: string) {
  let state = promptHistories.get(owner);
  if (!state) {
    state = { navigation: createPromptHistory<PromptDraft>(), hasMore: true };
    promptHistories.set(owner, state);
  }
  promptHistories.delete(owner);
  promptHistories.set(owner, state);
  while (promptHistories.size > 32) promptHistories.delete(promptHistories.keys().next().value!);
  return state;
}
let historyState = historyFor(props.owner);
let promptHistory = historyState.navigation;
const historyLoading = ref(false);
let historyRequest = new AbortController();
function cancelHistoryRequest() {
  historyRequest.abort();
  historyRequest = new AbortController();
  historyLoading.value = false;
}
function resetPromptHistory() {
  cancelHistoryRequest();
  historyState.before = undefined;
  historyState.hasMore = true;
  promptHistory.reset();
}
function switchPromptHistory(owner: string) {
  cancelHistoryRequest();
  historyState = historyFor(owner);
  promptHistory = historyState.navigation;
}
onBeforeUnmount(() => historyRequest.abort());
const editorText = text;

function setTextOwned(v: string) {
  text.value = v;
  chat.setDraft(v, attachmentsOwnerId.value);
}
function onEditorInput(value: string) {
  if (historyLoading.value) resetPromptHistory();
  syncAttachmentTags(text.value, value);
  setTextOwned(value);
}
function onEditorPaste(event: ClipboardEvent) {
  const insertion = ta.value?.createInsertion();
  void onPaste(event, (token) => insertion?.insert(token)).finally(() => insertion?.dispose());
}
const textEdits = new Map<Attachment, AbortController>();
const pendingTextEdits = new Set<Promise<void>>();
onBeforeUnmount(() => {
  for (const request of textEdits.values()) request.abort();
});
const openImage = useOpenImage();
function openAttachmentPreview(item: Attachment, event: Event) {
  const owner = attachmentsOwnerId.value;
  const anchor = event.currentTarget;
  if (item.kind === 'image') {
    const url = item.stored ? blobUrl(`${item.stored.owner}/${item.stored.id}`) : item.localUrl || '';
    const bytes = !item.stored && item.bytes.byteLength ? new Blob([item.bytes], { type: item.mime }) : undefined;
    return openImage(url, item.name, bytes);
  }
  previewAttachment(
    {
      ...item,
      ...(item.stored && !item.bytes.byteLength
        ? { bytes: undefined, url: blobUrl(`${item.stored.owner}/${item.stored.id}`) }
        : {}),
      ...(item.previewBlob ? { bytes: undefined, url: item.localUrl } : {}),
      editText: item.pastedText
        ? (value: string) => {
            if (owner !== attachmentsOwnerId.value || !attachments.value.includes(item)) return;
            textEdits.get(item)?.abort();
            const request = new AbortController();
            textEdits.set(item, request);
            const edit = (async () => {
              const previous = item.placeholder!;
              const bytes = new TextEncoder().encode(value).buffer;
              const token = `<paste-${await attachmentDigest(bytes, request.signal)}>`;
              if (owner !== attachmentsOwnerId.value || !attachments.value.includes(item)) return;
              item.bytes = bytes;
              delete item.stored;
              item.placeholder = token;
              // The text block uses bytes; retain its URL as the attachment row's stable key.
              setTextOwned(text.value.split(previous).join(token));
              saveAttachmentDrafts(owner, attachments.value);
              if (attachmentPreview.value?.anchor === anchor) attachmentPreview.value.bytes = bytes;
            })().catch((error) => {
              if (!request.signal.aborted) toast(errorDetail(error), { tone: 'error' });
            });
            pendingTextEdits.add(edit);
            void edit.finally(() => {
              pendingTextEdits.delete(edit);
              if (textEdits.get(item) === request) textEdits.delete(item);
            });
            return edit;
          }
        : undefined,
    },
    event,
  );
}

function removeAttachment(index: number) {
  const item = attachments.value[index];
  if (item) textEdits.get(item)?.abort();
  const token = attachments.value[index]?.placeholder;
  if (token) setTextOwned(text.value.split(token).join(''));
  discardAttachment(index);
}
watch(
  () => props.owner,
  (id, previous) => {
    if (previous !== id) for (const request of textEdits.values()) request.abort();
    // The drafts previously typed belong to the owner being left: land them before reading the next.
    if (previous && previous !== id) chat.flushDrafts(previous);
    text.value = chat.getDraft(id);
    switchPromptHistory(id);
  },
  { flush: 'sync' },
);

const running = computed(() => Boolean(stream.value?.active));
const canSend = computed(
  () =>
    (text.value.trim().length > 0 || attachments.value.length > 0) &&
    !attachments.value.some((item) => item.unavailable) &&
    !sending.value &&
    !readingAttachments.value &&
    !historyLoading.value &&
    !props.disabled,
);
const queueable = computed(() => running.value && (text.value.trim().length > 0 || attachments.value.length > 0));

// The field grows with its text; the start page's larger one on a desktop keeps its height.
useAutoGrow(() => ta.value?.el, [editorText, () => props.mobile], {
  mobile: () => props.mobile,
  fixed: () => props.start && !props.mobile,
});

async function submit() {
  if (sending.value || !canSend.value) return;
  const owner = props.owner;
  while (pendingTextEdits.size) {
    await Promise.all([...pendingTextEdits]);
    if (owner !== props.owner || sending.value || !canSend.value) return;
  }
  const payload = text.value;
  const submittedAttachments = attachments.value;
  const chosen = attachmentsForMessage(payload, submittedAttachments);
  if (
    [...payload.matchAll(/<reply-[a-f0-9]{64}>/g)].some(
      (match) => !chosen.some((a) => a.reply && a.placeholder === match[0]),
    )
  ) {
    toast(
      tr(
        '引用草稿已不可用，请移除标签后重新引用',
        'Reference draft unavailable; remove the token and select the source again',
      ),
    );
    return;
  }
  const references = chosen.filter((a) => a.reply).map((a) => a.reply!);
  let expanded = payload;
  for (const item of chosen)
    if (item.reply && item.placeholder) {
      expanded = expanded.replaceAll(
        item.placeholder,
        referenceDescription(item.reply) + (item.kind === 'image' ? `\n<image-${item.reply.imageId}>` : '') + '\n',
      );
    }
  const outgoing = chosen
    .filter((a) => !a.reply || a.kind === 'image')
    .map((a) => (a.reply ? { ...a, placeholder: `<image-${a.reply.imageId}>` } : a));
  const unique = outgoing.filter(
    (item, index, items) =>
      !item.placeholder || items.findIndex((other) => other.placeholder === item.placeholder) === index,
  );
  const sent = expandPastedText(expanded, unique);
  const metadata = references.length
    ? {
        reply_references: references,
        reply_sources: Object.fromEntries(references.map((r) => [r.source, true])),
        reply_draft: expandPastedText(payload, chosen).text,
      }
    : undefined;
  if (metadata && new TextEncoder().encode(JSON.stringify(metadata)).length > 60000) {
    toast(tr('引用内容过长，请减少引用', 'References are too large; remove some'));
    return;
  }
  submitting.value = true;
  try {
    const receipt = await (props.sendMessage
      ? props.sendMessage(sent.text, sent.attachments)
      : chat.send(sent.text, sent.attachments, metadata));
    if (!receipt) return;
    if (attachmentsOwnerId.value !== owner) {
      chat.setDraft('', owner);
      saveAttachmentDrafts(
        owner,
        attachmentDraftsFor<Attachment>(owner).filter((i) => !submittedAttachments.includes(i)),
      );
      revokeAll(submittedAttachments);
      return;
    }
    if (text.value === payload) {
      text.value = '';
      chat.setDraft('', owner);
    }
    resetPromptHistory();
    clearAttachmentUndo();
    attachments.value = attachments.value.filter((i) => !submittedAttachments.includes(i));
    saveAttachmentDrafts(owner, attachments.value);
    revokeAll(submittedAttachments);
  } catch (e: any) {
    if (attachmentsOwnerId.value === owner) toast(errorDetail(e), { tone: 'error' });
  } finally {
    submitting.value = false;
  }
}

async function pickAttachment(kind: 'image' | 'file', event: MouseEvent) {
  const button = event.currentTarget as HTMLButtonElement;
  const insertion = ta.value?.createInsertion();
  try {
    await attach(kind, (token) => insertion?.insert(token));
  } finally {
    insertion?.dispose();
    // File pickers can return focus to the touch trigger after they close.
    // Keep keyboard focus for keyboard activation, but clear pointer focus.
    if (event.detail > 0 && document.activeElement === button) button.blur();
  }
}

async function onStop() {
  if (live.value && !sending.value) await interruptReply(props.owner);
}

// Drafts are written a moment after typing stops; landing them on the way out keeps the last
// keystrokes, and an emptied field (a sent message) is already written at once by the writer.
const flushDrafts = () => chat.flushDrafts();
onMounted(() => {
  window.addEventListener('beforeunload', flushDrafts);
  window.addEventListener('pagehide', flushDrafts); // a phone may hide the page, never unload it
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', flushDrafts);
  window.removeEventListener('pagehide', flushDrafts);
  flushDrafts();
});

async function browsePromptHistory(direction: -1 | 1) {
  const owner = props.owner;
  const signal = historyRequest.signal;
  const current = { text: text.value, attachments: attachments.value.map((item) => ({ ...item })) };
  historyLoading.value = true;
  try {
    let older: HistoricalPrompt[] = [];
    if (!promptHistory.active) {
      historyState.before = undefined;
      historyState.hasMore = true;
    }
    if (direction === -1 && (!promptHistory.active || promptHistory.atOldest)) {
      while (historyState.hasMore && !older.length) {
        const page = await historyPage(
          owner,
          { before: historyState.before, limit: cfg.history.pageSize, order: 'desc' },
          { signal },
        );
        if (signal.aborted) return;
        const nextBefore = Math.min(...page.items.map((entry) => entry.seq));
        if (page.has_more && (!page.items.length || (historyState.before != null && nextBefore >= historyState.before)))
          throw new Error('History pagination did not advance');
        historyState.before = nextBefore;
        historyState.hasMore = page.has_more;
        older = sessionPrompts(
          [...page.items].sort((a, b) => a.seq - b.seq),
          owner,
        );
      }
      if (promptHistory.active) promptHistory.prepend(older);
    }
    const prompt = promptHistory.move(direction, current, () => older);
    if (prompt === undefined) return;
    if (attachmentPreview.value?.anchor && composerEl.value?.contains(attachmentPreview.value.anchor))
      attachmentPreview.value = null;
    setTextOwned(prompt.text);
    if (prompt.attachments.every((item): item is HistoricalAttachment => 'blob_id' in item))
      await refillAttachments(prompt.attachments);
    else replaceAttachments(prompt.attachments as AttachmentInput[]);
    await nextTick();
    if (!signal.aborted && owner === props.owner) ta.value?.moveCaretToEnd();
  } catch (error) {
    if (!signal.aborted) toast(errorDetail(error), { tone: 'error' });
  } finally {
    if (!signal.aborted) historyLoading.value = false;
  }
}
function onKeydown(e: KeyboardEvent) {
  if (
    !e.defaultPrevented &&
    !e.isComposing &&
    e.keyCode !== 229 &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    live.value &&
    !props.start &&
    !props.disabled &&
    !sending.value &&
    !historyLoading.value &&
    !readingAttachments.value &&
    chat.sessionId.value === props.owner &&
    (e.key === 'ArrowUp' || e.key === 'ArrowDown')
  ) {
    const direction = e.key === 'ArrowUp' ? -1 : 1;
    if (ta.value?.atHistoryBoundary(direction)) {
      e.preventDefault();
      void browsePromptHistory(direction);
      return;
    }
  }
  if (props.mobile || !isSendKey(e, sendOnEnter.value) || sending.value) return;
  e.preventDefault();
  submit();
}
</script>

<template>
  <div
    ref="composerEl"
    class="composer"
    @click="focusComposerBlank"
    :class="[
      mobile ? 'mobile' : 'desktop',
      { 'composer-start': start, 'composer-empty': !editorText && !attachments.length },
    ]"
  >
    <div v-if="!mobile" class="composer-toolbar">
      <Hint :text="i18n.t('chat.image')"
        ><button
          class="btn ghost icon-only"
          :aria-label="i18n.t('chat.image')"
          @click="pickAttachment('image', $event)"
        >
          <Icon name="image" /></button
      ></Hint>
      <Hint :text="i18n.t('chat.attach')"
        ><button
          class="btn ghost icon-only"
          :aria-label="i18n.t('chat.attach')"
          @click="pickAttachment('file', $event)"
        >
          <Icon name="paperclip" /></button
      ></Hint>
      <slot name="tools" />
      <slot name="selection" />
      <div class="grow" />
    </div>
    <ComposerAttachmentTray v-if="attachments.length > 0" :items="attachments">
      <div
        v-for="(img, i) in attachments"
        :key="img.localUrl || img.placeholder || img.stored?.id"
        class="attach-thumb"
      >
        <button v-if="img.reply" class="attachment-file reply-card" @click="replies?.locate(img.reply)">
          <img v-if="img.kind === 'image' && img.localUrl" :src="img.localUrl" alt="" /><Icon
            v-else
            name="reply"
          /><span>{{ img.reply.label }}</span>
        </button>
        <div v-else-if="img.unavailable" class="attachment-file" role="status">
          <Icon name="triangle-alert" /><span
            >{{ img.name }} · {{ tr('附件不可用，请移除或重新添加', 'Unavailable; remove or attach again') }}</span
          >
        </div>
        <Hint v-else-if="img.kind === 'image' && (img.mime !== 'image/tiff' || !!img.stored)" :text="img.name"
          ><img
            role="button"
            tabindex="0"
            aria-haspopup="dialog"
            :aria-label="img.name || i18n.t('chat.image')"
            @click="openAttachmentPreview(img, $event)"
            @keydown.enter.prevent="openAttachmentPreview(img, $event)"
            @keydown.space.prevent="openAttachmentPreview(img, $event)"
            :src="img.localUrl"
            :alt="img.name || i18n.t('chat.image')"
        /></Hint>
        <div
          v-else
          class="attachment-file"
          role="button"
          tabindex="0"
          aria-haspopup="dialog"
          :aria-expanded="attachmentPreview?.localUrl === img.localUrl"
          aria-controls="attachment-preview"
          @click="openAttachmentPreview(img, $event)"
          @keydown.enter.prevent="openAttachmentPreview(img, $event)"
          @keydown.space.prevent="openAttachmentPreview(img, $event)"
        >
          <Icon :name="img.pastedText ? 'clipboard' : img.kind === 'image' ? 'image' : 'paperclip'" />
          <div class="attachment-file-label">
            <span>{{ img.name || i18n.t('chat.attachment') }}</span
            ><small>{{ fmtBytes(img.size ?? img.bytes.byteLength) }}</small>
          </div>
        </div>
        <button class="rm" :aria-label="i18n.t('common.remove')" @click="removeAttachment(i)">
          <Icon name="x" class="sm" />
        </button>
      </div>
    </ComposerAttachmentTray>
    <div v-if="capsFailed" class="caps-error">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-if="mobile" class="composer-mobile-actions">
      <Menu :items="mobileMenuItems" :label="i18n.t('chatbar.more')" side="top" align="start" @select="mobileAction">
        <template #label="{ item }">
          <span :class="{ 'composer-option-value': item.key === 'model' || item.key === 'reasoning' }">{{
            item.label
          }}</span>
        </template>
        <template #trigger>
          <button class="btn ghost icon-only composer-menu" :aria-label="i18n.t('chatbar.more')">
            <Icon name="plus" />
          </button>
        </template>
      </Menu>
      <slot name="tools" />
      <div v-if="start" class="composer-start-selection"><slot name="selection" /></div>
      <div v-else class="grow" />
    </div>
    <div class="composer-editor">
      <InlineMessageEditor
        ref="ta"
        :scope="owner"
        :navigation="live || start"
        :attachments="attachments"
        @reference="locateReference"
        :placeholder="
          start
            ? 'Wish your dreams come true ...'
            : running
              ? i18n.t('chat.placeholderRunning')
              : i18n.t('chat.placeholder')
        "
        :label="i18n.t('chat.placeholder')"
        :text="editorText"
        @update:text="onEditorInput"
        @keydown="onKeydown"
        @paste="onEditorPaste"
      />
      <ComposerSendButtons
        v-if="!start"
        :running="running"
        :sending="sending"
        :can-send="canSend"
        :queueable="queueable"
        :show-shortcut="!mobile"
        @send="submit()"
        @stop="onStop()"
      />
    </div>
    <div v-if="start" class="composer-footer">
      <div v-if="$slots['footer-start']" class="composer-footer-start"><slot name="footer-start" /></div>
      <ComposerSendButtons
        :running="running"
        :sending="sending"
        :can-send="canSend"
        :queueable="queueable"
        :show-shortcut="!mobile"
        @send="submit()"
        @stop="onStop()"
      />
    </div>
  </div>
</template>
<style scoped>
.reply-card {
  font: inherit;
  font-size: 12px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  padding: 8px 10px;
  max-width: 240px;
  cursor: pointer;
  text-align: left;
}
.reply-card > img {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
}
.reply-card > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reply-card:hover {
  background: var(--bg-hover);
}
.composer-option-value {
  font-size: 12px;
  font-weight: var(--weight-latin-semibold);
  color: var(--fg-muted);
  text-transform: uppercase;
}

.composer-footer-start {
  margin-right: auto;
  min-width: 0;
  max-width: calc(100% - 52px);
}
</style>
