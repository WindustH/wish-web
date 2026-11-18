<script setup lang="ts">
import { computed, inject } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { configDraftKey } from './useConfigDraft.ts';
import SelectField from '../../ui/components/SelectField.vue';
import { terminalColorNames, wishTerminalTheme } from '../../ui/terminalTheme.ts';
import { tr } from '../../core/i18n/tr.ts';
const { draft, busy, shells } = inject(configDraftKey)!;
import type { TerminalSettings } from '../../core/configTypes.ts';
const defaults: TerminalSettings = {
  shell: '',
  persistence: 'none',
  per_session: false,
  session_name: '',
  font_size: 13,
  colors: {},
};
const settings = computed(() => draft.value.terminal ?? defaults);
function update<K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) {
  draft.value.terminal = { ...settings.value, [key]: value };
}
function color(name: string, value?: string) {
  const colors = { ...settings.value.colors };
  if (value) colors[name] = value;
  else delete colors[name];
  update('colors', colors);
}
const theme = computed(() => wishTerminalTheme(settings.value.colors));
const labels: Record<string, string> = {
  background: tr('背景', 'Background'),
  foreground: tr('文字', 'Text'),
  cursor: tr('光标', 'Cursor'),
  selectionBackground: tr('选区', 'Selection'),
};
function fontInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  if (input.value !== '' && Number.isInteger(value) && value >= 8 && value <= 32) update('font_size', value);
}
function fontCommit(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  update('font_size', input.value === '' ? 13 : Math.max(8, Math.min(32, Math.round(value) || 13)));
  input.value = String(settings.value.font_size);
}
</script>
<template>
  <fieldset class="settings-form" :disabled="busy">
    <section class="set-section">
      <div class="set-card">
        <label class="set-row"
          ><span class="set-label"
            >Shell<small>{{
              tr(
                '留空使用本机默认 Shell，启动时加载 profile。',
                'Leave empty for the host login shell. Loads its profile on startup.',
              )
            }}</small></span
          >
          <input
            :value="settings.shell"
            @input="update('shell', ($event.target as HTMLInputElement).value.trim())"
            class="input"
            list="terminal-shells"
            :placeholder="tr('本机默认 Shell', 'Host default shell')"
          />
          <datalist id="terminal-shells">
            <option v-for="shell in shells?.installed ?? []" :key="shell.program" :value="shell.program" />
          </datalist>
        </label>
        <div class="set-row">
          <span class="set-label"
            >{{ tr('持久化', 'Persistence')
            }}<small>{{
              tr(
                '默认连接已有会话。需在服务器上安装所选工具。',
                'Connects to an existing session by default. Install the selected tool on the server.',
              )
            }}</small></span
          >
          <SelectField
            :model-value="settings.persistence"
            @update:model-value="update('persistence', $event as TerminalSettings['persistence'])"
            :options="[
              { value: 'none', label: tr('不启用', 'Off') },
              { value: 'tmux', label: 'tmux' },
              { value: 'zellij', label: 'zellij' },
            ]"
          />
        </div>
      </div>
      <div v-if="settings.persistence !== 'none'" class="set-card">
        <div class="set-row">
          <label class="set-label" for="terminal-per-session"
            >{{ tr('每个 Wish 会话使用独立会话', 'Separate session for each Wish session')
            }}<small>{{
              tr(
                '开启后自动创建并恢复；关闭时仅连接已有会话。',
                'When on, creates and restores a dedicated session. When off, attaches to existing sessions only.',
              )
            }}</small></label
          ><SwitchRoot
            id="terminal-per-session"
            class="cfg-switch"
            :model-value="settings.per_session"
            @update:model-value="update('per_session', $event)"
            ><SwitchThumb class="cfg-switch-thumb"
          /></SwitchRoot>
        </div>
        <label v-if="!settings.per_session" class="set-row"
          ><span class="set-label"
            >{{ tr('已有会话名', 'Existing session name')
            }}<small>{{
              tr('留空由复用器选择已有会话。', 'Leave empty to let the multiplexer select an existing session.')
            }}</small></span
          ><input
            :value="settings.session_name"
            @input="update('session_name', ($event.target as HTMLInputElement).value.trim())"
            class="input"
            :placeholder="tr('自动选择', 'Automatic')"
            maxlength="128"
        /></label>
      </div>
      <p class="set-help">
        {{
          settings.persistence === 'none'
            ? tr(
                '离开终端时关闭 Shell；有任务运行时先询问。Ctrl-D 退出后会自动启动新的 Shell。',
                'Leaving closes the shell, with confirmation for running jobs. After Ctrl-D, a new shell starts automatically.',
              )
            : tr(
                '离开时断开连接，任务继续运行。再次打开恢复同一终端会话。',
                'Leaving detaches the terminal while jobs keep running. Reopening restores the same terminal session.',
              )
        }}
      </p>
      <p class="set-help">
        {{
          tr(
            'Shell 与持久化设置从下一次连接起生效；已存在的持久化会话保留原 Shell。',
            'Shell and persistence changes apply to the next connection. Existing persistent sessions keep their shell.',
          )
        }}
      </p>
    </section>
    <section class="set-section">
      <header class="set-section-head">
        <h3>{{ tr('外观', 'Appearance') }}</h3>
      </header>
      <div class="set-card">
        <label class="set-row"
          ><span class="set-label">{{ tr('字号（px）', 'Font size (px)') }}</span
          ><input
            :value="settings.font_size"
            @input="fontInput"
            @change="fontCommit"
            class="input terminal-size"
            type="number"
            min="8"
            max="32"
            step="1"
        /></label>
      </div>
      <div class="theme-heading">
        <span>Wish · {{ tr('跟随界面明暗模式', 'Follows interface appearance') }}</span
        ><button type="button" class="btn ghost sm" @click="update('colors', {})">
          {{ tr('恢复默认配色', 'Reset colors') }}
        </button>
      </div>
      <div
        class="terminal-preview"
        :style="{ background: theme.background, color: theme.foreground, fontSize: settings.font_size + 'px' }"
      >
        <div>
          <span :style="{ color: theme.green }">wish</span> <span :style="{ color: theme.blue }">~/workspace</span> $
          echo Hello
        </div>
        <div>Hello<span class="preview-cursor" :style="{ background: theme.cursor }" /></div>
        <div class="ansi-preview">
          <span v-for="name in terminalColorNames.slice(4)" :key="name" :style="{ background: theme[name] }" />
        </div>
      </div>
      <div class="terminal-colors">
        <label v-for="name in terminalColorNames" :key="name"
          ><input
            type="color"
            :value="theme[name]"
            @input="color(name, ($event.target as HTMLInputElement).value)"
          /><span>{{ labels[name] || name }}</span
          ><button
            v-if="settings.colors[name]"
            type="button"
            class="btn ghost sm"
            :aria-label="tr('恢复默认', 'Reset')"
            @click="color(name)"
          >
            ↺
          </button></label
        >
      </div>
    </section>
  </fieldset>
</template>
<style scoped>
.set-label {
  flex: 1;
  min-width: 0;
}
.set-label small {
  display: block;
  color: var(--fg-muted);
  font-weight: normal;
  margin-top: 4px;
}
.set-row > .input {
  max-width: 220px;
}
.set-row > .terminal-size {
  width: 90px;
}
.theme-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 8px;
  font-size: 12px;
  color: var(--fg-muted);
}
.terminal-preview {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-family: var(--mono);
  line-height: 1.7;
  overflow: auto;
}
.preview-cursor {
  display: inline-block;
  width: 8px;
  height: 1em;
  margin-left: 2px;
  vertical-align: middle;
}
.ansi-preview {
  display: flex;
  gap: 3px;
  margin-top: 12px;
}
.ansi-preview span {
  height: 10px;
  flex: 1;
  border-radius: 2px;
}
.terminal-colors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 16px;
  margin-top: 16px;
}
.terminal-colors label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.terminal-colors input {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  padding: 0;
}
</style>
