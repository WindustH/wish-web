<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { record } from '../shared/validation.ts';
const props = defineProps<{ output: Record<string, unknown> }>();
const tools = computed(() => (Array.isArray(props.output.tools) ? props.output.tools : []).map(record).filter(Boolean));
const selected = computed(() => record(props.output.tool));
</script>
<template>
  <section class="discovery-result">
    <article v-for="(tool, index) in tools" :key="index">
      <strong>{{ tool?.tool }}</strong>
      <p>{{ tool?.summary }}</p>
      <div class="tags">
        <code v-for="tag in Array.isArray(tool?.tags) ? tool.tags : []" :key="String(tag)">{{ tag }}</code>
      </div>
    </article>
    <template v-if="selected">
      <strong>{{ selected.name }}</strong>
      <p>{{ selected.description }}</p>
      <details>
        <summary>{{ tr('参数说明', 'Parameters') }}</summary>
        <pre>{{ JSON.stringify(selected.input_schema, null, 2) }}</pre>
      </details>
      <details v-if="output.examples">
        <summary>{{ tr('调用示例', 'Examples') }}</summary>
        <pre>{{ JSON.stringify(output.examples, null, 2) }}</pre>
      </details>
      <details v-if="output.services">
        <summary>{{ tr('可用服务（按优先级）', 'Available services (in priority order)') }}</summary>
        <pre>{{ JSON.stringify(output.services, null, 2) }}</pre>
      </details>
    </template>
    <p v-else-if="!tools.length">{{ tr('没有匹配的可用工具。', 'No matching tools are available.') }}</p>
  </section>
</template>
<style scoped>
.discovery-result {
  display: grid;
  gap: 16px;
  min-width: 0;
}
p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 6px 0;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--fg-muted);
}
code {
  background: var(--bg-inset);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
summary {
  cursor: pointer;
}
pre {
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
