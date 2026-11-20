<script setup lang="ts">
// The shell commands run under: a program, its arguments, and how a command is started. Given
// `follow`, the program list starts with that choice - following a shell set elsewhere - and the
// rest waits until another is chosen.
import { computed, ref } from 'vue';
import SettingsPage from '../../ui/components/SettingsPage.vue';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SelectField from '../providers/SelectField.vue';
import KeyValueEditor from './KeyValueEditor.vue';
import SwitchRow from './SwitchRow.vue';
import { tr } from '../../core/i18n/tr.ts';

import type { ShellCatalog } from '../../core/api/endpoints.ts';
import type { ShellSettings } from '../../core/api/types.ts';

const props = defineProps<{
  value: ShellSettings;
  catalog: ShellCatalog | null;
  follow?: string;
  followNote?: string;
}>();
const following = defineModel<boolean>('following', { default: false });

// Not a path, so it can never collide with an installed shell's program.
const CUSTOM = 'custom:';
const FOLLOW = 'follow:';
const installed = computed(() => props.catalog?.installed ?? []);
const customChosen = ref(false);
const environmentOpen = ref(false);
const mobile = useIsMobile();
const known = computed(() =>
  !props.value.program
    ? props.catalog?.default
    : installed.value.find((shell) => shell.program === props.value.program),
);
const selection = computed({
  get: () =>
    props.follow && following.value
      ? FOLLOW
      : customChosen.value || (props.value.program && !known.value)
        ? CUSTOM
        : props.value.program,
  set: (next: string) => {
    following.value = next === FOLLOW;
    if (next === FOLLOW) return;
    customChosen.value = next === CUSTOM;
    if (next !== CUSTOM) props.value.program = next;
    // Arguments belong to the shell they were written for.
    props.value.args = null;
  },
});
const options = computed(() => [
  ...(props.follow ? [{ value: FOLLOW, label: props.follow, annotation: props.followNote }] : []),
  { value: '', label: tr('系统默认', 'System default'), annotation: props.catalog?.default.program },
  ...installed.value.map((shell) => ({
    value: shell.program,
    label: shell.name ?? shell.program,
    annotation: shell.program,
  })),
  { value: CUSTOM, label: tr('自定义路径…', 'Custom path…') },
]);
const argsText = computed({
  get: () => props.value.args?.join(' ') ?? '',
  set: (text: string) => {
    const args = text.trim().split(/\s+/).filter(Boolean);
    props.value.args = args.length ? args : null;
  },
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
    <label class="set-row"
      ><span class="set-label"
        ><span>{{ tr('程序', 'Program') }}</span
        ><small>{{ tr('执行命令使用的 Shell', 'The shell that runs commands') }}</small></span
      ><SelectField mobile-page picker-title="Shell" v-model="selection" :options="options"
    /></label>
    <template v-if="!(follow && following)">
      <label v-if="selection === CUSTOM" class="set-row"
        ><span class="set-label"
          ><span>{{ tr('程序路径', 'Program path') }}</span
          ><small>{{ tr('可执行文件的绝对路径', 'Absolute path to the executable') }}</small></span
        ><input
          class="input"
          v-model.trim="value.program"
          placeholder="/usr/bin/zsh"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
      /></label>
      <label class="set-row"
        ><span class="set-label"
          ><span>{{ tr('启动参数', 'Arguments') }}</span
          ><small>{{ tr('留空时按 Shell 类型自动选择', 'Chosen from the shell type when empty') }}</small></span
        ><input
          class="input"
          v-model.lazy="argsText"
          :placeholder="defaultArgs ? tr('默认：', 'Default: ') + defaultArgs : tr('自动', 'Automatic')"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
      /></label>
      <div v-if="preview" class="set-row shell-preview">
        <span class="set-label"
          ><span>{{ tr('执行方式', 'Runs as') }}</span
          ><small>{{ tr('每条命令实际的启动方式', 'How each command is started') }}</small></span
        ><code>{{ preview }}</code>
      </div>
      <SwitchRow
        :model-value="value.use_network_proxy ?? false"
        @update:model-value="value.use_network_proxy = $event"
        :name="tr('跟随网络代理', 'Follow network proxy')"
        :hint="
          tr(
            '自动设置 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY 及其小写形式。',
            'Set HTTP_PROXY, HTTPS_PROXY, ALL_PROXY and their lowercase forms automatically.',
          )
        "
      />
      <div class="set-row inline">
        <span class="set-label">{{ tr('预置环境变量', 'Preset environment variables') }}</span>
        <button type="button" class="btn settings-page-link shell-env-open" @click="environmentOpen = true">
          {{ tr('配置变量', 'Configure variables') }}<Icon name="arrow-up-right" :size="15" />
        </button>
      </div>
      <SettingsPage
        :open="environmentOpen"
        :page="mobile"
        :title="tr('预置环境变量', 'Preset environment variables')"
        @close="environmentOpen = false"
      >
        <p class="hint">
          {{
            tr(
              '从下一条命令生效；自定义值优先，按原样传入。',
              'Changes apply to the next command. Custom values take priority and are passed literally.',
            )
          }}
        </p>
        <KeyValueEditor
          v-model="value.env"
          secret-values
          :name-placeholder="tr('变量名', 'Variable name')"
          :value-placeholder="tr('变量值', 'Value')"
          :add-label="tr('添加环境变量', 'Add environment variable')"
        />
      </SettingsPage>
    </template>
  </div>
</template>

<style scoped>
.shell-preview code {
  justify-self: stretch;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  color: var(--fg-muted);
  font: calc(12.5px * var(--mono-scale))/1.6 var(--mono);
  overflow-wrap: anywhere;
}
</style>
