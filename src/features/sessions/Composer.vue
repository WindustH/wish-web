<script setup lang="ts">
import { errorDetail } from '../../core/errors.ts';
import { attachmentPreview, previewAttachment } from '../../ui/attachmentPreview.ts';
import { attachmentDigestFallback } from '../../core/attachmentDigest.ts';
import { expandPastedText } from '../../core/pastedText.ts';
import InlineMessageEditor from './InlineMessageEditor.vue';
import { attachmentsForMessage } from '../../core/attachmentPlaceholders.ts';
import Hint from '../../ui/components/Hint.vue';
import { attachmentDraftsFor, attachmentLimits, saveAttachmentDrafts, type AttachmentInput } from '../../core/attachments.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import BubbleSurface from '../../ui/components/BubbleSurface.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import AskContext from './AskContext.vue';
import { useComposerAttachments, type Attachment } from './useComposerAttachments.ts';
import { useBtwPopup } from './useBtwPopup.ts';
import { tr } from '../../core/i18n/tr.ts';
import { isSendKey } from '../../ui/sendKey.ts';
import ComposerSendButtons from './ComposerSendButtons.vue';
import { useAutoGrow } from './useAutoGrow.ts';

const props = defineProps<{
  /** Whose drafts these are: the open session's id, a group's, or the start page's own key. */
  owner: string;
  mobile: boolean;
  /** The start page's composer, laid out larger with its send button in a footer. */
  start?: boolean;
  disabled?: boolean;
  /** Where the message goes when it is not the open session: a new session, or a group. */
  sendMessage?: (text: string, attachments: AttachmentInput[]) => Promise<string>;
}>();

// Writing to the open session: the composer follows its run, can stop it and ask it aside.
const live = computed(() => !props.sendMessage);
const submitting = ref(false);
const stream = computed(() => (live.value ? chat.stream.value : null));
const sending = computed(() => submitting.value || (live.value && chat.sending.value));
const caps = computed(() => (live.value ? chat.capabilities.value : null));
const sendOnEnter = computed(() => prefs.sendOnEnter.value);

const composerEl = ref<HTMLElement | null>(null);
const ta = ref<InstanceType<typeof InlineMessageEditor> | null>(null);
const pageActive = usePageActivity();
const btwButton = ref<HTMLButtonElement | null>(null);
const btwBubble = ref<HTMLElement | null>(null);
const { btwOpen, btwHidden, btwPosition, toggleBtw } =
  useBtwPopup(computed(() => props.mobile), pageActive, composerEl, ta, btwButton, btwBubble);
const btwChat = ref<InstanceType<typeof AskContext> | null>(null);
const btwDraft = ref('');
const btwMode = computed(() => props.mobile && btwOpen.value);
const btwBusy = computed(() => Boolean(btwChat.value?.busy));


function focusComposerBlank(event: MouseEvent) {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches('.composer, .composer-editor, .composer-toolbar, .composer-footer, .composer-mobile-actions, .grow')) {
    ta.value?.focus();
  }
}

function fill(v: string, attachmentsToFill?: any[]) {
  setTextOwned(v);
  void nextTick(() => ta.value?.focus());
  void refillAttachments(attachmentsToFill ?? []);
}

defineExpose({ focus: () => ta.value?.focus(), fill });


const capsFailed = computed(() => caps.value?.status === 'error');
const capsData = computed(() => (caps.value?.status === 'ok' ? caps.value.data : null));
const limits = computed(() => attachmentLimits(capsData.value));

// Attachments management
const {
  attachments,
  readingAttachments,
  currentSid,
  attach,
  onPaste,
  removeAttachment: discardAttachment,
  refillAttachments,
  syncAttachmentTags,
  clearAttachmentUndo,
  revokeAll,
} = useComposerAttachments(computed(() => props.owner), limits);

const text = ref(chat.getDraft(props.owner));
const editorText = computed(() => btwMode.value ? btwDraft.value : text.value);

function setTextOwned(v: string) {
  text.value = v;
  chat.setDraft(v, currentSid.value);
}
function onEditorInput(value: string) {
  if (btwMode.value) btwDraft.value = value;
  else { syncAttachmentTags(text.value, value); setTextOwned(value); }
}
function onEditorPaste(event: ClipboardEvent) {
  if (btwMode.value) return;
  const insertion = ta.value?.createInsertion();
  void onPaste(event, token => insertion?.insert(token)).finally(() => insertion?.dispose());
}
function openAttachmentPreview(item: Attachment, event: Event) {
  const owner = currentSid.value;
  const anchor = event.currentTarget;
  previewAttachment({ ...item, editText: item.pastedText ? value => {
    if (owner !== currentSid.value || !attachments.value.includes(item)) return;
    const previous = item.placeholder!;
    const bytes = new TextEncoder().encode(value).buffer;
    const token = `<paste-${attachmentDigestFallback(bytes)}>`;
    item.bytes = bytes;
    item.placeholder = token;
    // The text block uses bytes; retain its URL as the attachment row's stable key.
    setTextOwned(text.value.split(previous).join(token));
    saveAttachmentDrafts(owner, attachments.value);
    if (attachmentPreview.value?.anchor === anchor) attachmentPreview.value.bytes = bytes;
  } : undefined }, event);
}

function removeAttachment(index: number) {
  const token = attachments.value[index]?.placeholder;
  if (token) setTextOwned(text.value.split(token).join(''));
  discardAttachment(index);
}
function submitBtw() {
  if (btwChat.value?.submitQuestion(btwDraft.value)) btwDraft.value = '';
}

watch(
  () => props.owner,
  (id) => {
    text.value = chat.getDraft(id);
    btwDraft.value = '';
    btwOpen.value = false;
  },
  { flush: 'sync' },
);

const running = computed(() => Boolean(stream.value?.active));
const canSend = computed(
  () =>
    (text.value.trim().length > 0 || attachments.value.length > 0) &&
    !sending.value &&
    !readingAttachments.value &&
    !props.disabled,
);
const queueable = computed(
  () => running.value && (text.value.trim().length > 0 || attachments.value.length > 0),
);

// The field grows with its text; the start page's larger one on a desktop keeps its height.
useAutoGrow(() => ta.value?.el, [editorText, () => props.mobile], { mobile: () => props.mobile, fixed: () => props.start && !props.mobile });

async function submit() {
  if (btwMode.value) { submitBtw(); return; }
  if (sending.value || !canSend.value) return;
  const owner = props.owner;
  const payload = text.value;
  const submittedAttachments = attachments.value;
  const sent = expandPastedText(payload, attachmentsForMessage(payload, submittedAttachments));
  submitting.value = true;
  try {
    const receipt = await (props.sendMessage
      ? props.sendMessage(sent.text, sent.attachments)
      : chat.send(sent.text, sent.attachments));
    if (!receipt) return;
    if (currentSid.value !== owner) {
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
    clearAttachmentUndo();
    attachments.value = attachments.value.filter((i) => !submittedAttachments.includes(i));
    saveAttachmentDrafts(owner, attachments.value);
    revokeAll(submittedAttachments);
  } catch (e: any) {
    if (currentSid.value === owner) toast(errorDetail(e));
  } finally {
    submitting.value = false;
  }
}

async function pickAttachment(kind: 'image' | 'file', event: MouseEvent) {
  const button = event.currentTarget as HTMLButtonElement;
  const insertion = ta.value?.createInsertion();
  try {
    await attach(kind, token => insertion?.insert(token));
  } finally {
    insertion?.dispose();
    // File pickers can return focus to the touch trigger after they close.
    // Keep keyboard focus for keyboard activation, but clear pointer focus.
    if (event.detail > 0 && document.activeElement === button) button.blur();
  }
}

const interrupting = ref(false);
async function onStop() {
  if (!running.value || sending.value || interrupting.value) return;
  interrupting.value = true;
  try {
    await chat.interrupt();
  } catch (e: any) {
    toast(i18n.t('chat.stopFailed') + ': ' + errorDetail(e));
  } finally {
    interrupting.value = false;
  }
}

function interruptWithEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.repeat || event.isComposing || event.keyCode === 229 ||
      event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (!live.value || !running.value || sending.value || interrupting.value ||
      chat.sessionId.value !== props.owner || !composerEl.value?.getClientRects().length) return;
  // Capture before a popup closes: the same Escape must not also interrupt the session.
  const popup = [...document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
  )].some(element => element.getClientRects().length > 0);
  if (popup) return;
  event.preventDefault();
  event.stopPropagation();
  void onStop();
}
onMounted(() => window.addEventListener('keydown', interruptWithEscape, true));
onBeforeUnmount(() => window.removeEventListener('keydown', interruptWithEscape, true));

function onKeydown(e: KeyboardEvent) {
  if (props.mobile || !isSendKey(e, sendOnEnter.value) || sending.value) return;
  e.preventDefault();
  submit();
}

</script>

<template>
  <div ref="composerEl" class="composer" @click="focusComposerBlank" :class="[mobile ? 'mobile' : 'desktop', { 'composer-start': start }]">
    <div v-if="!mobile" class="composer-toolbar">
      <Hint :text="i18n.t('chat.image')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.image')"
        @click="pickAttachment('image', $event)"><Icon name="image" /></button></Hint>
      <Hint :text="i18n.t('chat.attach')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.attach')"
        @click="pickAttachment('file', $event)"><Icon name="paperclip" /></button></Hint>
      <button v-if="live" ref="btwButton" type="button" class="btn ghost composer-btw" :aria-label="tr('BTW · 临时对话', 'BTW · Temporary chat')" :aria-expanded="btwOpen" aria-haspopup="dialog" aria-controls="btw-bubble" @click="toggleBtw">BTW</button>
      <slot name="tools" />
      <slot name="selection" />
      <div class="grow" />
    </div>
    <div v-if="attachments.length > 0 && !btwMode" class="attachment-preview">
      <div class="attach-strip">
      <div v-for="(img, i) in attachments" :key="img.localUrl" class="attach-thumb">
        <Hint v-if="img.kind === 'image'" :text="img.name"><img role="button" tabindex="0" aria-haspopup="dialog" :aria-expanded="attachmentPreview?.localUrl === img.localUrl" aria-controls="attachment-preview" @click="openAttachmentPreview(img, $event)" @keydown.enter.prevent="openAttachmentPreview(img, $event)" @keydown.space.prevent="openAttachmentPreview(img, $event)" :src="img.localUrl" :alt="img.name || i18n.t('chat.image')" /></Hint>
        <div v-else class="attachment-file" role="button" tabindex="0" aria-haspopup="dialog" :aria-expanded="attachmentPreview?.localUrl === img.localUrl" aria-controls="attachment-preview" @click="openAttachmentPreview(img, $event)" @keydown.enter.prevent="openAttachmentPreview(img, $event)" @keydown.space.prevent="openAttachmentPreview(img, $event)"><Icon :name="img.pastedText ? 'clipboard' : 'paperclip'" /><div class="attachment-file-label"><span>{{ img.name || i18n.t('chat.attachment') }}</span><small>{{ fmtBytes(img.bytes.byteLength) }}</small></div></div>
        <button class="rm" :aria-label="i18n.t('common.remove')" @click="removeAttachment(i)">
          <Icon name="x" class="sm" />
        </button>
      </div>
    </div>
    </div>
    <div v-if="capsFailed && !btwMode" class="caps-error">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-if="mobile" class="composer-mobile-actions">
      <Hint v-if="!btwMode" :text="i18n.t('chat.image')"><button class="btn ghost icon-only"
        :aria-label="i18n.t('chat.image')" @click="pickAttachment('image', $event)"><Icon name="image" /></button></Hint>
      <Hint v-if="!btwMode" :text="i18n.t('chat.attach')"><button class="btn ghost icon-only"
        :aria-label="i18n.t('chat.attach')" @click="pickAttachment('file', $event)"><Icon name="paperclip" /></button></Hint>
      <button v-if="live" ref="btwButton" type="button" class="btn ghost composer-btw" :aria-label="tr('BTW · 临时对话', 'BTW · Temporary chat')" :aria-expanded="btwOpen" aria-haspopup="dialog" aria-controls="btw-bubble" @click="toggleBtw">BTW</button>
      <slot v-if="!btwMode" name="tools" />
      <div v-if="start" class="composer-start-selection"><slot name="selection" /></div>
      <div v-else class="grow" />
    </div>
    <div class="composer-editor">
      <InlineMessageEditor ref="ta" :scope="`${owner}:${btwMode}`" :attachments="btwMode ? [] : attachments"
        :placeholder="btwMode ? (tr('顺便问一下…', 'By the way…')) : running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')"
        :label="btwMode ? (tr('顺便问一下', 'By the way')) : i18n.t('chat.placeholder')" :text="editorText"
        @update:text="onEditorInput" @keydown="onKeydown" @paste="onEditorPaste" />
      <Hint v-if="mobile && btwMode" :text="btwBusy?tr('停止回答','Stop answering'):tr('发送问题','Send question')"><button class="send-btn" :class="{ stop: btwBusy }" :disabled="!btwBusy && !btwDraft.trim()"
        :aria-label="btwBusy?tr('停止回答','Stop answering'):tr('发送问题','Send question')"
        @click="btwBusy ? btwChat?.stopAnswer() : submitBtw()">
        <Icon :name="btwBusy ? 'square' : 'send'" />
      </button></Hint>
      <ComposerSendButtons v-else-if="!start" :running="running" :sending="sending" :can-send="canSend" :queueable="queueable && !btwMode" :escape-stops="!mobile" @send="submit()" @stop="onStop()" />
    </div>
    <div v-if="start" class="composer-footer">
      <div v-if="$slots['footer-start']" class="composer-footer-start"><slot name="footer-start" /></div>
      <ComposerSendButtons :running="running" :sending="sending" :can-send="canSend" :queueable="queueable" :escape-stops="!mobile" @send="submit()" @stop="onStop()" />
    </div>
    <Teleport v-if="live" to="body">
      <Transition name="btw-popup" @after-leave="btwHidden = true">
        <div v-show="btwOpen" id="btw-bubble" ref="btwBubble" class="btw-bubble" :class="{ mobile }" role="dialog" :aria-label="tr('BTW 临时对话', 'BTW temporary chat')" :style="btwPosition">
          <BubbleSurface side="bottom" :tail-x="parseFloat(btwPosition['--bubble-tail-x'] || '24')" />
          <AskContext ref="btwChat" :key="owner" :session-id="owner" :hidden="btwHidden" :external-input="mobile" @cleared="btwDraft=''" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
<style scoped>
.composer-footer-start { margin-right:auto; min-width:0; max-width:calc(100% - 52px); }
.composer-btw{height:32px;min-height:32px;padding:0 9px;flex:none;font-size:11px;font-weight:var(--weight-latin-bold);letter-spacing:.05em;color:var(--fg-subtle)}
.composer-btw[aria-expanded='true']{background:var(--bg-hover);color:var(--fg)}
:global(.btw-bubble){--bubble-surface:var(--bg-raised);position:fixed;z-index:72;display:flex;flex-direction:column;width:min(460px,calc(100vw - 16px));height:min(440px,calc(100dvh - 120px));min-height:0;background:transparent;border:1px solid transparent;border-radius:14px;isolation:isolate;transform-origin:bottom left}
:global(.btw-bubble > .ask-context){overflow:hidden;border-radius:inherit;background:var(--bg)}
:global(.btw-popup-enter-active),:global(.btw-popup-leave-active){transition:opacity 180ms var(--ease-out),transform 180ms var(--ease-out)}
:global(.btw-popup-enter-from),:global(.btw-popup-leave-to){opacity:0;transform:translateY(8px) scale(.98)}
@media(prefers-reduced-motion:reduce){:global(.btw-popup-enter-active),:global(.btw-popup-leave-active){transition-duration:1ms}}
:global(.btw-bubble.mobile){--bubble-surface:var(--bg);width:min(460px,calc(100vw - 40px));height:min(390px,calc(100dvh - 150px));border-radius:12px}
@media(max-width:899px){.composer-btw{height:32px;min-height:32px;padding:0 7px}}
</style>
