<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import { tr } from './fields.ts';

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
    <label class="set-row"><span class="set-label"><span>{{ tr('程序', 'Program') }}</span><small>{{ tr('执行命令使用的 Shell', 'The shell that runs commands') }}</small></span><SelectField mobile-page picker-title="Shell" v-model="selection" :options="options" /></label>
    <label v-if="selection === CUSTOM" class="set-row"><span class="set-label"><span>{{ tr('程序路径', 'Program path') }}</span><small>{{ tr('可执行文件的绝对路径', 'Absolute path to the executable') }}</small></span><input class="input set-mono" v-model.trim="value.program" placeholder="/usr/bin/zsh" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
    <label class="set-row"><span class="set-label"><span>{{ tr('启动参数', 'Arguments') }}</span><small>{{ tr('留空时按 Shell 类型自动选择', 'Chosen from the shell type when empty') }}</small></span><input class="input set-mono" v-model.lazy="argsText" :placeholder="defaultArgs ? tr('默认：', 'Default: ') + defaultArgs : tr('自动', 'Automatic')" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
    <div v-if="preview" class="set-row shell-preview"><span class="set-label"><span>{{ tr('执行方式', 'Runs as') }}</span><small>{{ tr('每条命令实际的启动方式', 'How each command is started') }}</small></span><code>{{ preview }}</code></div>
  </div>
</template>

<style scoped>
.set-row input::placeholder { font-family: var(--font); }
.shell-preview code { justify-self: stretch; padding: 7px 10px; border-radius: 8px; background: var(--bg-sunken); color: var(--fg-muted); font: calc(12.5px * var(--mono-scale))/1.6 var(--mono); overflow-wrap: anywhere; }
</style>
