<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../../core/i18n/tr.ts';
const props = defineProps<{ request: Record<string, unknown> }>();
const fields = computed(() => Object.entries(props.request).filter(([, value]) => value !== null));
const labels = () => ({
  prompt: tr('提示词', 'Prompt'),
  service: tr('服务', 'Service'),
  parameters: tr('参数', 'Parameters'),
  action: tr('操作', 'Action'),
  query: tr('查询', 'Query'),
  audio: tr('音频', 'Audio'),
  reference_images: tr('参考图', 'Reference images'),
});
const label = (key: string) => (labels() as Record<string, string>)[key] ?? key;
</script>
<template>
  <dl class="extension-arguments">
    <div v-for="[key, value] in fields" :key="key">
      <dt>{{ label(key) }}</dt>
      <dd>{{ typeof value === 'string' ? value : JSON.stringify(value, null, 2) }}</dd>
    </div>
  </dl>
</template>
<style scoped>
.extension-arguments {
  display: grid;
  gap: 12px;
  margin: 0;
  min-width: 0;
}
dt {
  color: var(--fg-muted);
  font-size: 12px;
  margin-bottom: 4px;
}
dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow: auto;
}
</style>
