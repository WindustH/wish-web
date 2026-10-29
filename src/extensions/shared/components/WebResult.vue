<script setup lang="ts">
import { computed } from 'vue';
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const props = defineProps<{ output: Record<string, unknown> }>();
const results = computed(() =>
  (Array.isArray(props.output.results) ? props.output.results : []).map(record).filter(Boolean),
);
function href(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
</script>
<template>
  <section class="web-result">
    <p v-if="typeof output.provider === 'string'" class="detail-muted">{{ output.provider }}</p>
    <p
      v-for="(warning, index) in Array.isArray(output.warnings)
        ? output.warnings.filter((value) => typeof value === 'string')
        : []"
      :key="`warning:${index}`"
      role="status"
    >
      {{ warning }}
    </p>
    <article v-for="(item, index) in results" :key="index">
      <a v-if="href(item?.url)" :href="href(item?.url)" target="_blank" rel="noopener noreferrer">{{
        item?.title || item?.url
      }}</a>
      <small v-if="item?.site || item?.published">{{ item?.site }} {{ item?.published }}</small>
      <p>{{ item?.snippet ?? item?.description ?? item?.content }}</p>
    </article>
    <p v-if="output.content || output.text">{{ output.content ?? output.text }}</p>
    <pre v-if="!results.length && !output.content && !output.text">{{ JSON.stringify(output, null, 2) }}</pre>
  </section>
</template>
<style scoped>
.web-result {
  display: grid;
  gap: 12px;
  min-width: 0;
}
p,
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 4px 0 0;
  max-height: 480px;
  overflow: auto;
}
a {
  overflow-wrap: anywhere;
}
</style>
