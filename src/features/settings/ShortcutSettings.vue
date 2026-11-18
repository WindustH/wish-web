<script setup lang="ts">
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { tr } from '../../core/i18n/tr.ts';
import { cfg } from '../../core/config.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import {
  browserShortcutKeys,
  defaultBindings,
  keyBinding,
  shortcutLabel,
  sameBinding,
  validBinding,
  type BrowserShortcut,
  type KeyBinding,
  type ShortcutId,
} from '../../core/shortcuts.ts';
import Icon from '../../ui/components/Icon.vue';
import KeyCaps from '../../ui/components/KeyCaps.vue';
import NavigationShortcuts from './NavigationShortcuts.vue';

const commands = computed(() => [
  {
    id: 'toggleRightSidebar' as const,
    label: tr('开关右侧栏', 'Toggle right sidebar'),
    hint: tr('会话页面', 'Session pages'),
  },
  {
    id: 'toggleLeftSidebar' as const,
    label: tr('开关左侧栏', 'Toggle left sidebar'),
    hint: tr('桌面会话列表', 'Desktop session list'),
  },
  { id: 'quickSwitchSessions' as const, label: tr('快速切换会话', 'Quick switch sessions') },
  { id: 'interruptReply' as const, label: tr('中断模型回答', 'Interrupt model response') },
  { id: 'searchSessions' as const, label: tr('搜索会话', 'Search sessions') },
  { id: 'searchChat' as const, label: tr('搜索当前会话', 'Search current session') },
  { id: 'openSettings' as const, label: tr('打开设置', 'Open settings') },
  { id: 'newSession' as const, label: tr('新建会话', 'New session') },
]);
const browserCommands = computed(() => [
  { id: 'find' as const, label: tr('浏览器查找', 'Browser find') },
  { id: 'caretBrowsing' as const, label: tr('光标浏览', 'Caret browsing') },
  { id: 'print' as const, label: tr('打印', 'Print') },
  { id: 'save' as const, label: tr('保存网页', 'Save page') },
  { id: 'devTools' as const, label: tr('开发者工具', 'Developer tools') },
]);
const bindings = computed(() => shortcuts.value.value.bindings);
const blocked = computed(() => shortcuts.value.value.blockedBrowser);
const recording = ref<ShortcutId | null>(null);
const error = ref('');
function set(id: ShortcutId, binding: KeyBinding | null) {
  const conflict = binding && shortcuts.conflict(id, binding);
  if (conflict) {
    const name = commands.value.find((command) => command.id === conflict)?.label;
    error.value = tr(
      `此按键已用于“${name}”，请先更改或停用该快捷键。`,
      `This key is assigned to “${name}”. Change or disable that shortcut first.`,
    );
    return;
  }
  if (
    binding &&
    Object.values(shortcuts.value.value.navigation.keys).some(
      (key) =>
        key &&
        sameBinding(
          binding,
          keyBinding({
            key,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: key.length === 1 && key !== key.toLowerCase(),
          }),
        ),
    )
  ) {
    error.value = tr(
      '此按键已用于高级键盘导航，请先修改或停用该导航键。',
      'This key is assigned to keyboard navigation. Change or disable it in advanced settings first.',
    );
    return;
  }
  if (shortcuts.setBinding(id, binding)) {
    recording.value = null;
    error.value = '';
  }
}
function record(event: KeyboardEvent, id: ShortcutId) {
  if (recording.value !== id) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.isComposing || event.keyCode === 229 || event.repeat) return;
  if (event.key === 'Escape') {
    recording.value = null;
    error.value = '';
    return;
  }
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return;
  if (
    ['Backspace', 'Delete'].includes(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  )
    return set(id, null);
  const binding = keyBinding(event);
  if (!validBinding(binding)) {
    error.value = tr(
      '请使用 Ctrl、⌘ 或 Alt 组合键，也可以使用 Tab 或 F1–F12。',
      'Use Ctrl, ⌘ or Alt with a key, or use Tab or F1–F12.',
    );
    return;
  }
  set(id, binding);
}
function reset() {
  shortcuts.reset();
  prefs.setSendOnEnter(cfg.composer.sendOnEnter);
  recording.value = null;
  error.value = '';
}
function browserLabel(id: BrowserShortcut) {
  if (id === 'find') return 'Ctrl / ⌘ + F · F3 / Shift + F3 · Ctrl / ⌘ + G / Ctrl / ⌘ + Shift + G';
  if (id === 'caretBrowsing') return 'F7';
  if (id === 'devTools') return 'F12 · Ctrl + Shift + I / J / C · ⌘ + Alt + I / J / C';
  return `${shortcutLabel({ key: browserShortcutKeys[id], ctrl: true })} · ${shortcutLabel({ key: browserShortcutKeys[id], meta: true })}`;
}
</script>

<template>
  <div class="shortcut-settings" data-keyboard-boundary>
    <section class="set-section">
      <header class="set-section-head">
        <div class="shortcut-heading">
          <h3>{{ tr('应用快捷键', 'Application shortcuts') }}</h3>
          <button type="button" class="btn ghost" @click="reset">{{ tr('恢复默认', 'Restore defaults') }}</button>
        </div>
        <p id="shortcut-help">
          {{
            tr(
              '点击按键后输入新组合。Esc 取消，Backspace 停用。',
              'Click a binding and press a new combination. Esc cancels; Backspace disables it.',
            )
          }}
        </p>
      </header>
      <div class="set-card">
        <div
          v-for="command in commands"
          :key="command.id"
          class="set-row inline shortcut-row shortcut-binding-row"
          :data-shortcut="command.id"
        >
          <div class="set-label shortcut-name">
            <span :id="`shortcut-${command.id}`">{{ command.label }}</span>
            <small v-if="command.hint">{{ command.hint }}</small>
          </div>
          <div class="shortcut-actions">
            <button
              type="button"
              class="shortcut-binding"
              data-navigation-ignore
              :class="{ recording: recording === command.id }"
              :aria-label="`${command.label}: ${bindings[command.id] ? shortcutLabel(bindings[command.id]!) : tr('未绑定', 'Unassigned')}`"
              aria-describedby="shortcut-help"
              :aria-pressed="recording === command.id"
              @click="
                recording = recording === command.id ? null : command.id;
                error = '';
              "
              @blur="recording = null"
              @keydown="record($event, command.id)"
            >
              <span v-if="recording === command.id" class="binding-placeholder">{{
                tr('请按快捷键…', 'Press keys…')
              }}</span>
              <KeyCaps v-else-if="bindings[command.id]" :label="shortcutLabel(bindings[command.id]!)" />
              <span v-else class="binding-placeholder">{{ tr('未绑定', 'Unassigned') }}</span>
            </button>
            <button
              type="button"
              class="btn ghost icon-only"
              :disabled="!bindings[command.id]"
              :aria-label="tr(`停用${command.label}`, `Disable ${command.label}`)"
              @click="set(command.id, null)"
            >
              <Icon name="x" :size="16" />
            </button>
            <button
              type="button"
              class="btn ghost icon-only"
              :aria-label="tr(`恢复${command.label}默认按键`, `Reset ${command.label}`)"
              @click="set(command.id, defaultBindings[command.id])"
            >
              <Icon name="undo" :size="16" />
            </button>
          </div>
        </div>
      </div>
      <p v-if="error" class="shortcut-error" role="alert">{{ error }}</p>
    </section>
    <section class="set-section">
      <header class="set-section-head">
        <h3>{{ tr('消息输入', 'Message input') }}</h3>
      </header>
      <div class="set-card">
        <div class="set-row inline shortcut-row">
          <div class="set-label shortcut-name">
            <label for="send-on-enter">{{ tr('按 Enter 发送消息', 'Send with Enter') }}</label>
            <small>{{
              prefs.sendOnEnter.value
                ? tr('Shift + Enter 换行', 'Shift + Enter for a new line')
                : tr('Enter 换行，Ctrl / ⌘ + Enter 发送', 'Enter for a new line; Ctrl / ⌘ + Enter to send')
            }}</small>
          </div>
          <SwitchRoot
            id="send-on-enter"
            class="cfg-switch"
            :model-value="prefs.sendOnEnter.value"
            @update:model-value="prefs.setSendOnEnter"
            ><SwitchThumb class="cfg-switch-thumb"
          /></SwitchRoot>
        </div>
      </div>
    </section>
    <NavigationShortcuts />
    <section class="set-section">
      <header class="set-section-head">
        <h3>{{ tr('浏览器快捷键', 'Browser shortcuts') }}</h3>
        <p>
          {{
            tr(
              '开启表示允许，关闭表示禁用。绑定了应用动作时，仍执行应用动作。',
              'On allows the browser action; off disables it. Any assigned app command still runs.',
            )
          }}
        </p>
      </header>
      <div class="set-card">
        <div v-for="command in browserCommands" :key="command.id" class="set-row inline shortcut-row">
          <div class="set-label shortcut-name">
            <label :for="`browser-${command.id}`">{{ command.label }}</label
            ><small>{{ browserLabel(command.id) }}</small>
          </div>
          <SwitchRoot
            :id="`browser-${command.id}`"
            class="cfg-switch"
            :model-value="!blocked[command.id]"
            @update:model-value="shortcuts.setBrowserBlocked(command.id, !$event)"
            ><SwitchThumb class="cfg-switch-thumb"
          /></SwitchRoot>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shortcut-settings {
  container: shortcut-settings / inline-size;
}
.shortcut-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.shortcut-row {
  grid-template-columns: minmax(0, 1fr) auto;
}
.shortcut-name label {
  font: 500 13.5px/1.45 var(--font);
}
.shortcut-name small {
  overflow-wrap: anywhere;
}
.shortcut-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.shortcut-binding {
  display: inline-flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 36px;
  padding: 3px 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--fg-muted);
  font: 12px/1.4 var(--mono);
}
.shortcut-binding:focus-visible {
  outline: none;
}
.shortcut-binding:focus-visible :deep(.keycap),
.shortcut-binding:focus-visible .binding-placeholder,
.shortcut-binding.recording .binding-placeholder {
  border-color: var(--accent);
}
.binding-placeholder {
  padding: 6px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: 6px;
}
.shortcut-binding.recording .binding-placeholder {
  color: var(--accent);
  background: var(--accent-soft);
}
@media (hover: hover) {
  .shortcut-binding:hover :deep(.keycap) {
    border-color: var(--accent);
  }
}
.shortcut-error {
  color: var(--danger);
  margin-top: 12px;
}
@media (max-width: 899px) {
  .shortcut-binding {
    min-width: 0;
    min-height: 44px;
  }
  .shortcut-heading .btn {
    padding-inline: 4px;
    font-size: 12px;
  }
  .shortcut-actions {
    gap: 0;
  }
  .shortcut-name label {
    font-size: 13.5px;
  }
}
@container shortcut-settings (max-width: 420px) {
  .set-row.shortcut-binding-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .shortcut-binding-row .shortcut-actions {
    min-width: 0;
    justify-content: flex-end;
  }
  .shortcut-binding {
    min-width: 0;
    flex: 1;
  }
}
</style>
