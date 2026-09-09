<script setup lang="ts">
// Safe markdown: markdown-it with html OFF, then DOMPurify the output.
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const props = defineProps<{ text: string }>();

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

const html = computed(() => DOMPurify.sanitize(md.render(props.text ?? '')));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — DOMPurify-sanitized markdown -->
  <div class="markdown" v-html="html" />
</template>
