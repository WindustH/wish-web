<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import DOMPurify from 'dompurify';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { replyReferenceId, type ReplyReference } from '../../core/replyReferences.ts';
import { replyContextKey } from '../references/context.ts';
import { highlightCode } from '../../ui/codeHighlight.ts';
import { codeLanguage, sourcePreviewKind } from '../../ui/codeLanguage.ts';
import { sourceRange, sourceSelection } from '../../ui/sourceSelection.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import CopyButton from '../../ui/components/CopyButton.vue';
import SegmentedControl from '../../ui/components/SegmentedControl.vue';
import Markdown from '../references/ReferenceMarkdown.vue';
import ImagePreview from './ImagePreview.vue';

const props = defineProps<{
  text: string;
  name: string;
  mime: string;
  session: string;
  blob: string;
  version?: string;
  scroll: number;
  truncated: boolean;
  toolbar?: HTMLElement;
  focus?: ReplyReference;
}>();
const emit = defineEmits<{ scroll: [top: number] }>();
const active = usePageActivity();
const replies = inject(replyContextKey, undefined);
const mode = ref('source');
watch([() => props.session, () => props.blob], () => {
  mode.value = 'source';
});
const previewKind = computed(() => sourcePreviewKind(props.name, props.mime));
const language = computed(() => codeLanguage(props.name, props.mime) ?? 'plaintext');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
// Preserve CRLF offsets through the HTML parser as well as syntax spans.
const html = computed(() =>
  (highlightCode(props.text, language.value) || escape(props.text)).replaceAll('\r', '&#13;'),
);
const numbers = computed(() => Array.from({ length: props.text.split(/\r\n?|\n/).length }, (_, i) => i + 1).join('\n'));
const viewport = ref<HTMLElement>();
const code = ref<HTMLElement>();
const selection = shallowRef<ReturnType<typeof sourceSelection>>();
const quoting = ref(false);
const canQuote = computed(() => active.value && replies?.session.value === props.session && !!selection.value);
function selectedRange() {
  const selected = document.getSelection();
  return code.value && selected?.rangeCount
    ? sourceSelection(code.value, props.text, selected.getRangeAt(0))
    : undefined;
}
function readSelection() {
  selection.value = mode.value === 'source' && active.value ? selectedRange() : undefined;
}
watch(
  active,
  (visible, _, cleanup) => {
    if (!visible) {
      selection.value = undefined;
      return;
    }
    document.addEventListener('selectionchange', readSelection);
    cleanup(() => document.removeEventListener('selectionchange', readSelection));
  },
  { immediate: true },
);
watch([() => props.text, mode], () => {
  selection.value = undefined;
});
watch(
  viewport,
  (element) => {
    if (element && mode.value === 'source') element.scrollTop = props.scroll;
  },
  { flush: 'post' },
);
function copySelection(event: ClipboardEvent) {
  const current = selectedRange();
  if (!current || !event.clipboardData) return;
  event.clipboardData.setData('text/plain', current.text);
  event.preventDefault();
}
async function quote() {
  const current = selection.value;
  if (!current || !replies || replies.session.value !== props.session || quoting.value) return;
  if (current.text.length > 16000) {
    toast(tr('选区过长，请缩小范围', 'Selection too long; select a smaller excerpt'));
    return;
  }
  quoting.value = true;
  try {
    const lines =
      current.lineStart === current.lineEnd ? String(current.lineStart) : `${current.lineStart}–${current.lineEnd}`;
    await replies.add({
      ...current,
      id: replyReferenceId(),
      session: props.session,
      source: `blob_${props.blob}`,
      blob: props.blob,
      fileName: props.name,
      version: props.version,
      label: `${props.name} · L${lines}`,
    });
  } finally {
    quoting.value = false;
  }
}
watch(
  () => props.focus,
  (focus) => {
    if (focus) mode.value = focus.region && previewKind.value === 'svg' ? 'preview' : 'source';
  },
  { immediate: true },
);
watch(
  [code, () => props.focus],
  ([element, focus]) => {
    if (
      !element ||
      !focus ||
      focus.blob !== props.blob ||
      focus.start === undefined ||
      focus.end === undefined ||
      props.text.slice(focus.start, focus.end) !== focus.text
    )
      return;
    const range = sourceRange(element, focus.start, focus.end);
    if (!range || !viewport.value) return;
    const current = document.getSelection();
    current?.removeAllRanges();
    current?.addRange(range);
    viewport.value.scrollTop +=
      range.getBoundingClientRect().top - viewport.value.getBoundingClientRect().top - viewport.value.clientHeight / 3;
  },
  { flush: 'post' },
);

const documentHtml = computed(() => {
  if (mode.value !== 'preview' || previewKind.value !== 'html') return '';
  const clean = DOMPurify.sanitize(props.text, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'form'],
  });
  const policy =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  // DOMPurify may preserve attributes on <head>; the policy must always be its first child.
  return /<head\b[^>]*>/i.test(clean) ? clean.replace(/<head\b[^>]*>/i, (head) => head + meta) : meta + clean;
});
const svgUrl = ref('');
watch(
  [mode, previewKind, () => props.text],
  ([mode, kind, text], _, cleanup) => {
    svgUrl.value = '';
    if (mode !== 'preview' || kind !== 'svg') return;
    const clean = DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true } });
    const url = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
    svgUrl.value = url;
    cleanup(() => URL.revokeObjectURL(url));
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  selection.value = undefined;
});
</script>

<template>
  <section class="source-preview">
    <Teleport :to="toolbar || 'body'" :disabled="!toolbar">
      <div class="source-toolbar">
        <button
          v-if="canQuote"
          type="button"
          class="btn ghost sm source-quote"
          :disabled="quoting"
          :aria-label="tr('引用选区', 'Quote selection')"
          :title="tr('引用选区', 'Quote selection')"
          @pointerdown.prevent
          @click="quote"
        >
          <Icon name="reply" /><span>{{ tr('引用选区', 'Quote selection') }}</span>
        </button>
        <CopyButton v-if="mode === 'source'" :text="text" />
        <SegmentedControl
          v-if="previewKind"
          v-model="mode"
          :label="tr('文件视图', 'File view')"
          :options="[
            { value: 'source', label: tr('源码', 'Source'), icon: 'terminal' },
            { value: 'preview', label: tr('预览', 'Preview'), icon: 'eye' },
          ]"
        />
      </div>
    </Teleport>
    <div
      v-if="mode === 'source'"
      ref="viewport"
      class="source-scroll"
      @scroll.passive="emit('scroll', ($event.target as HTMLElement).scrollTop)"
      @copy="copySelection"
    >
      <div class="source-lines">
        <pre class="source-numbers" aria-hidden="true">{{ numbers }}</pre>
        <pre
          class="source-code"
          tabindex="0"
          :aria-label="name"
        ><code ref="code" class="code-highlight" :data-language="language" v-html="html" /></pre>
      </div>
    </div>
    <ImagePreview
      v-else-if="previewKind === 'svg' && svgUrl"
      :src="svgUrl"
      :alt="name"
      :state-key="`${session}/${blob}/svg`"
      :reference="{ session, blob }"
      :focus="focus"
    />
    <iframe
      v-else-if="previewKind === 'html'"
      class="source-html"
      :srcdoc="documentHtml"
      sandbox=""
      referrerpolicy="no-referrer"
      :title="name"
    />
    <div v-else-if="previewKind === 'markdown'" class="source-markdown"><Markdown :text="text" /></div>
    <p v-if="truncated" class="source-truncated">{{ i18n.t('library.truncated') }}</p>
  </section>
</template>

<style scoped>
.source-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.source-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.source-toolbar :deep(.segment) {
  min-height: 26px;
  padding: 0 8px;
}
.source-quote {
  white-space: nowrap;
}
@container (max-width: 480px) {
  .source-quote {
    width: 32px;
    min-width: 32px;
    padding: 4px;
  }
  .source-quote span {
    display: none;
  }
}
.source-scroll,
.source-markdown {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.source-lines {
  display: flex;
  min-width: 100%;
  width: max-content;
  align-items: stretch;
}
.source-lines pre {
  margin: 0;
  font: 13px/1.7 var(--mono);
  tab-size: 4;
  white-space: pre;
}
.source-numbers {
  position: sticky;
  left: 0;
  z-index: 1;
  flex: none;
  padding: 0 12px 0 8px;
  border-right: 1px solid var(--line);
  background: var(--bg);
  color: var(--fg-subtle);
  text-align: right;
  user-select: none;
}
.source-code {
  flex: 1;
  padding: 0 14px;
  outline: none;
  user-select: text;
  -webkit-user-select: text;
}
.source-code code {
  font: inherit;
  color: var(--fg);
}
.source-markdown {
  padding: 8px 12px;
  user-select: text;
}
.source-html {
  width: 100%;
  flex: 1;
  min-height: 0;
  border: 0;
  background: white;
  color-scheme: light;
}
.source-truncated {
  flex: none;
  color: var(--fg-muted);
  font-size: 12px;
  margin: 8px 0;
}
</style>
