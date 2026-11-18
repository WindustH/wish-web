<script setup lang="ts">
import { computed, inject, ref, onScopeDispose, onDeactivated } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { prefs, type TerminalEngine } from '../../core/state/prefsSlice.ts';
import { configDraftKey } from './useConfigDraft.ts';
import SelectField from '../../ui/components/SelectField.vue';
import ColorField from '../../ui/components/ColorField.vue';
import { parseTerminalTheme, terminalThemeSizeLimit } from '../../ui/terminalThemeImport.ts';
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
const themeFile = ref<HTMLInputElement>();
const importMessage = ref(''),
  importFailed = ref(false);
let disposed = false,
  importVersion = 0;
onScopeDispose(() => {
  disposed = true;
});
onDeactivated(() => {
  importVersion++;
  importMessage.value = '';
  importFailed.value = false;
});
async function importTheme(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const version = ++importVersion;
  importMessage.value = '';
  importFailed.value = false;
  try {
    if (file.size > terminalThemeSizeLimit) throw new Error('theme_size');
    const colors = parseTerminalTheme(await file.text());
    if (disposed || version !== importVersion) return;
    update('colors', colors);
    importMessage.value = tr(
      `已导入 ${file.name} · ${Object.keys(colors).length} 色，保存后生效`,
      `Imported ${file.name} · ${Object.keys(colors).length} colors. Save to apply.`,
    );
  } catch (cause) {
    if (disposed || version !== importVersion) return;
    importFailed.value = true;
    const code = cause instanceof Error ? cause.message : '';
    importMessage.value =
      code === 'theme_size'
        ? tr('主题文件不能超过 256 KiB。', 'Theme files must be no larger than 256 KiB.')
        : code === 'theme_empty'
          ? tr(
              '文件中没有可用的终端颜色。支持 Wish/xterm JSON 和 .itermcolors。',
              'No terminal colors found. Use Wish/xterm JSON or .itermcolors.',
            )
          : code === 'theme_color'
            ? tr('主题中有无效颜色，原配色未改动。', 'The theme contains an invalid color. Existing colors were kept.')
            : tr(
                '无法读取主题格式，请选择 JSON 或 .itermcolors 文件。',
                'Could not read this theme. Choose a JSON or .itermcolors file.',
              );
  }
}
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
        <div class="set-row">
          <span class="set-label"
            >{{ tr('终端引擎', 'Terminal engine')
            }}<small>{{ tr('仅在此设备生效', 'Applies to this device') }}</small></span
          >
          <SelectField
            :model-value="prefs.terminalEngine.value"
            @update:model-value="prefs.setTerminalEngine($event as TerminalEngine)"
            :options="[
              { value: 'xterm', label: 'xterm.js' },
              { value: 'restty', label: 'restty · WebGPU / WebGL2' },
              { value: 'wraith', label: 'Wraith · WebGPU' },
            ]"
          />
        </div>
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
            @input="update('shell', ($event.target as HTMLInputElement).value)"
            @change="update('shell', ($event.target as HTMLInputElement).value.trim())"
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
            @input="update('session_name', ($event.target as HTMLInputElement).value)"
            @change="update('session_name', ($event.target as HTMLInputElement).value.trim())"
            class="input"
            :placeholder="tr('自动选择', 'Automatic')"
            maxlength="128"
        /></label>
      </div>
      <p class="set-help">
        {{
          settings.persistence === 'none'
            ? tr(
                '切换页面保留终端，退出 Wish 前端时关闭。Ctrl-D 退出后自动启动新的 Shell。',
                'Keeps running across pages; closes when leaving Wish. After Ctrl-D, a new shell starts automatically.',
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
        <span>Wish · {{ tr('跟随界面明暗模式', 'Follows interface appearance') }}</span>
        <div class="theme-actions">
          <input
            ref="themeFile"
            class="theme-file"
            type="file"
            accept=".json,.itermcolors,application/json"
            :aria-label="tr('导入终端主题', 'Import terminal theme')"
            @change="importTheme"
          />
          <button type="button" class="btn ghost sm" @click="themeFile?.click()">
            {{ tr('导入主题', 'Import theme') }}
          </button>
          <button
            type="button"
            class="btn ghost sm"
            @click="
              update('colors', {});
              importMessage = '';
            "
          >
            {{ tr('恢复默认', 'Reset') }}
          </button>
        </div>
      </div>
      <p
        v-if="importMessage"
        class="theme-import-message"
        :class="{ error: importFailed }"
        :role="importFailed ? 'alert' : 'status'"
      >
        {{ importMessage }}
      </p>
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
        <div v-for="name in terminalColorNames" :key="name" class="terminal-color">
          <span>{{ labels[name] || name }}</span>
          <ColorField
            :model-value="theme[name] || '#000000'"
            :label="labels[name] || name"
            @update:model-value="color(name, $event)"
          />
          <button
            type="button"
            class="btn ghost sm color-reset"
            :disabled="!settings.colors[name]"
            :aria-label="tr('恢复默认', 'Reset') + ': ' + (labels[name] || name)"
            @click="color(name)"
          >
            ↺
          </button>
        </div>
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px 16px;
  margin-top: 16px;
}
.terminal-color {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-width: 0;
}
.terminal-color > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.color-reset {
  min-height: 28px;
  width: 24px;
  padding: 2px;
}
.color-reset:disabled {
  opacity: 0;
}
.theme-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.theme-file {
  display: none;
}
.theme-import-message {
  font-size: 12px;
  color: var(--fg-muted);
  margin: 6px 0;
}
.theme-import-message.error {
  color: var(--err);
}
@media (max-width: 599px) {
  .theme-heading {
    flex-wrap: wrap;
  }
}
</style>
