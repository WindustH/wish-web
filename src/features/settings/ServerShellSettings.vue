<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import { tr } from './fields';

export type ShellInfo = { name: string | null; program: string; args: string[] };
export type ShellCatalog = { default: ShellInfo; installed: ShellInfo[] };
type ShellSettings = { program: string; args: string[] | null };

const props = defineProps<{ value: ShellSettings; catalog: ShellCatalog | null }>();

// Not a path, so it can never collide with an installed shell's program.
const CUSTOM = 'custom:';
const installed = computed(() => props.catalog?.installed ?? []);
const customChosen = ref(false);
const known = computed(() => !props.value.program ? props.catalog?.default : installed.value.find(shell => shell.program === props.value.program));
const selection = computed({
  get: () => customChosen.value || (props.value.program && !known.value) ? CUSTOM : props.value.program,
  set: (next: string) => {
    customChosen.value = next === CUSTOM;
    if (next !== CUSTOM) props.value.program = next;
    // Arguments belong to the shell they were written for.
    props.value.args = null;
  },
});
const options = computed(() => [
  { value: '', label: tr('系统默认', 'System default'), annotation: props.catalog?.default.program },
  ...installed.value.map(shell => ({ value: shell.program, label: shell.name ?? shell.program, annotation: shell.program })),
  { value: CUSTOM, label: tr('自定义路径…', 'Custom path…') },
]);
const argsText = computed({
  get: () => props.value.args?.join(' ') ?? '',
  set: (text: string) => { const args = text.trim().split(/\s+/).filter(Boolean); props.value.args = args.length ? args : null; },
});
const defaultArgs = computed(() => known.value?.args.join(' ') ?? '');
const preview = computed(() => {
  const program = props.value.program || props.catalog?.default.program;
  if (!program) return '';
  const args = props.value.args ?? known.value?.args;
  return [program, ...(args ?? []), tr('<命令>', '<command>')].join(' ');
});
</script>

<template>
  <div class="shell-fields">
    <label>{{ tr('程序', 'Program') }}<SelectField mobile-page picker-title="Shell" v-model="selection" :options="options" /></label>
    <label v-if="selection === CUSTOM">{{ tr('程序路径', 'Program path') }}<input class="input" v-model.trim="value.program" placeholder="/usr/bin/zsh" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
    <label>{{ tr('启动参数', 'Arguments') }}<input class="input" v-model.lazy="argsText" :placeholder="defaultArgs ? tr('默认：', 'Default: ') + defaultArgs : tr('按 Shell 名称自动选择', 'Chosen from the shell name')" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
    <p v-if="preview" class="shell-preview"><span>{{ tr('执行方式', 'Runs as') }}</span><code>{{ preview }}</code></p>
  </div>
</template>

<style scoped>
.shell-fields { display: grid; gap: 12px; }
.shell-fields label { display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: center; gap: 16px; min-width: 0; font-size: 13px; }
.shell-fields input { width: 100%; min-width: 0; font-family: var(--mono); }
.shell-fields input::placeholder { font-family: var(--font); }
.shell-preview { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 16px; align-items: baseline; margin: 0; font-size: 12px; color: var(--fg-subtle); }
.shell-preview code { font-family: var(--mono); color: var(--fg-muted); overflow-wrap: anywhere; }
@media (max-width: 899px) {
  .shell-fields { gap: 0; }
  .shell-fields label { display: block; padding: 12px 14px; }
  .shell-fields label + label { border-top: 1px solid var(--line); }
  .shell-fields label > :is(input, .control-select) { margin-top: 8px; }
  .shell-preview { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-top: 1px solid var(--line); }
}
</style>
