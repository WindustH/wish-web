<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import { codeLanguage } from '../../ui/codeLanguage.ts';
import { highlightCode } from '../../ui/codeHighlight.ts';
import { renderMarkdown } from '../../ui/markdown.ts';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ text: string; name?: string; mime?: string; bookmark?: boolean }>();
const sample = computed(() => props.text.slice(0, 6000));
const language = computed(() =>
  props.bookmark ? 'markdown' : (codeLanguage(props.name ?? '', props.mime) ?? 'plaintext'),
);
const markdown = computed(() => language.value === 'markdown');
const html = computed(() =>
  markdown.value
    ? DOMPurify.sanitize(renderMarkdown(sample.value, ''), {
        // A thumbnail has no controls or network-backed media, even in a saved message.
        FORBID_TAGS: [
          'img',
          'picture',
          'video',
          'audio',
          'source',
          'iframe',
          'object',
          'embed',
          'button',
          'input',
          'form',
          'style',
          'link',
        ],
        FORBID_ATTR: ['href', 'src', 'srcset', 'style', 'tabindex'],
      })
    : highlightCode(sample.value, language.value),
);
</script>

<template>
  <span
    class="library-thumbnail library-document-thumbnail"
    :class="{ 'document-code': !markdown, 'document-bookmark': bookmark }"
    aria-hidden="true"
    inert
  >
    <span class="document-back-page" />
    <span class="document-page code-highlight">
      <span v-if="markdown" class="document-markdown" v-html="html" />
      <pre v-else><code v-if="html" v-html="html" /><code v-else>{{ sample }}</code></pre>
    </span>
    <Icon v-if="bookmark" name="bookmark" class="document-bookmark-icon" :size="22" />
  </span>
</template>

<style scoped>
.library-document-thumbnail {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-sunken);
  pointer-events: none;
  user-select: none;
}
.document-code {
  background: var(--bg-raised);
}
.document-back-page {
  position: absolute;
  inset: 10px 8% -20px;
  transform: rotate(-4deg);
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--bg-raised);
}
.document-page {
  position: absolute;
  top: 15px;
  left: 6%;
  width: 196%;
  min-height: 300px;
  padding: 26px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--bg);
  color: var(--fg);
  transform: scale(0.45);
  transform-origin: top left;
  font-size: 18px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.document-page pre {
  margin: 0;
  white-space: pre;
  font: 16px / 1.65 var(--font-mono);
}
.document-markdown :deep(:first-child) {
  margin-top: 0;
}
.document-markdown :deep(:is(p, ul, ol, blockquote, pre, table)) {
  margin: 0 0 16px;
}
.document-markdown :deep(:is(h1, h2, h3, h4, h5, h6)) {
  margin: 18px 0 12px;
  line-height: 1.25;
}
.document-markdown :deep(h1) {
  font-size: 30px;
}
.document-markdown :deep(h2) {
  font-size: 25px;
}
.document-markdown :deep(h3) {
  font-size: 21px;
}
.document-markdown :deep(:is(ul, ol)) {
  padding-left: 24px;
}
.document-markdown :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: 14px;
  color: var(--fg-muted);
}
.document-markdown :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.document-markdown :deep(.code-head) {
  display: none;
}
.document-markdown :deep(table) {
  border-collapse: collapse;
}
.document-markdown :deep(:is(th, td)) {
  border: 1px solid var(--line);
  padding: 4px 8px;
}
.document-bookmark-icon {
  position: absolute;
  right: 7px;
  bottom: 7px;
  color: var(--accent);
}
</style>
