<script setup lang="ts">
// Names and values edited as rows: an MCP server's environment or headers. A value the server
// hides comes back as "<redacted>"; left empty, it keeps the stored one. Nothing is written back
// until a row changes, so opening the editor leaves the draft as it was.
import { ref, watch } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from './fields.ts';

const REDACTED = '<redacted>';
const props = defineProps<{ modelValue?: Record<string, string>; namePlaceholder: string; valuePlaceholder: string; addLabel: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, string> | undefined] }>();

type Row = { name: string; value: string; hidden: boolean };
const rows = ref<Row[]>(Object.entries(props.modelValue ?? {}).map(([name, value]) =>
  value === REDACTED ? { name, value: '', hidden: true } : { name, value, hidden: false }));

watch(rows, next => {
  const entries = next
    .filter(row => row.name.trim())
    .map(row => [row.name.trim(), row.value || (row.hidden ? REDACTED : '')]);
  // The server leaves an empty map out, so an emptied one is left out too.
  emit('update:modelValue', entries.length ? Object.fromEntries(entries) : undefined);
}, { deep: true });
</script>

<template>
  <div class="kv-editor">
    <div v-for="(row, index) in rows" :key="index" class="kv-row">
      <input class="input set-mono" v-model="row.name" :placeholder="namePlaceholder" :aria-label="namePlaceholder" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <input class="input set-mono" v-model="row.value" :type="row.hidden ? 'password' : 'text'" :placeholder="row.hidden ? tr('已配置，留空保留', 'Configured; leave empty to keep') : valuePlaceholder" :aria-label="row.name || valuePlaceholder" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button type="button" class="btn ghost icon-only kv-remove" :aria-label="tr('删除 ', 'Remove ') + row.name" @click="rows.splice(index, 1)"><Icon name="x" /></button>
    </div>
    <button type="button" class="btn ghost kv-add" @click="rows.push({ name: '', value: '', hidden: false })"><Icon name="plus" />{{ addLabel }}</button>
  </div>
</template>

<style scoped>
.kv-editor { display: grid; gap: 8px; min-width: 0; }
.kv-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto; gap: 8px; align-items: center; }
.kv-row .input::placeholder { font-family: var(--font); }
.kv-remove { color: var(--fg-subtle); }
.kv-add { justify-self: start; display: inline-flex; align-items: center; gap: 6px; color: var(--fg-muted); }
.kv-add .icon { width: 14px; height: 14px; }
@media (max-width: 599px) {
  .kv-row { grid-template-columns: minmax(0, 1fr) auto; }
  .kv-row > .input:nth-child(2) { grid-column: 1; grid-row: 2; }
  .kv-row > .kv-remove { grid-row: 1 / span 2; grid-column: 2; }
}
</style>
