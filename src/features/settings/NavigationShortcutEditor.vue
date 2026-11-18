<script setup lang="ts">
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import {
  defaultNavigation,
  validNavigationKey,
  keyBinding,
  sameBinding,
  type NavigationAction,
} from '../../core/shortcuts.ts';
import { tr } from '../../core/i18n/tr.ts';
import KeyCaps from '../../ui/components/KeyCaps.vue';
const nav = computed(() => shortcuts.value.value.navigation);
const error = ref('');
const actions = computed<{ id: NavigationAction; label: string }[]>(() => [
  { id: 'focus', label: tr('聚焦消息输入框', 'Focus message input') },
  { id: 'exit', label: tr('退出消息输入框', 'Leave message input') },
  { id: 'down', label: tr('向下滚动对话', 'Scroll conversation down') },
  { id: 'up', label: tr('向上滚动对话', 'Scroll conversation up') },
  { id: 'nextMessage', label: tr('下一条用户消息', 'Next user message') },
  { id: 'previousMessage', label: tr('上一条用户消息', 'Previous user message') },
  { id: 'command', label: tr('命令面板', 'Command palette') },
]);
function key(event: KeyboardEvent, id: NavigationAction) {
  if (event.key === 'Tab') return;
  event.preventDefault();
  event.stopPropagation();
  if (event.isComposing || event.keyCode === 229 || event.repeat) return;
  const value = ['Backspace', 'Delete'].includes(event.key) ? '' : event.key;
  if (event.ctrlKey || event.metaKey || event.altKey || !validNavigationKey(value)) {
    error.value = tr(
      '使用单个字符、Esc 或 F1–F12。Backspace 停用。',
      'Use a character, Esc or F1–F12. Backspace disables.',
    );
    return;
  }
  if (value && Object.entries(nav.value.keys).some(([other, binding]) => other !== id && binding === value)) {
    error.value = tr('这个按键已用于另一项导航操作。', 'This key is already assigned to another navigation action.');
    return;
  }
  if (
    value &&
    Object.values(shortcuts.value.value.bindings).some((binding) => sameBinding(binding, keyBinding(event)))
  ) {
    error.value = tr(
      '这个按键已用于应用快捷键。请先修改或停用原快捷键。',
      'This key is assigned to an application shortcut. Change or disable it first.',
    );
    return;
  }
  error.value = '';
  shortcuts.setNavigation({ ...nav.value, keys: { ...nav.value.keys, [id]: value } });
}
function sequence(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (value && !/^[!-~]{2,6}$/.test(value)) {
    error.value = tr(
      '退出序列需要 2–6 个非空白英文字符，留空则停用。',
      'Use 2–6 non-space ASCII characters, or leave empty to disable.',
    );
    return;
  }
  error.value = '';
  shortcuts.setNavigation({ ...nav.value, exitSequence: value });
}
function intervalInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isInteger(value) || value < 100 || value > 2000) {
    error.value = tr('按键间隔需要为 100–2000 毫秒。', 'Use an interval of 100–2000 ms.');
    return;
  }
  error.value = '';
  shortcuts.setNavigation({ ...nav.value, sequenceTimeout: value });
}
function interval(event: Event) {
  const input = event.target as HTMLInputElement;
  shortcuts.setNavigation({ ...nav.value, sequenceTimeout: Number(input.value) });
  input.value = String(nav.value.sequenceTimeout);
}
</script>
<template>
  <div class="navigation-editor" data-keyboard-boundary>
    <header class="navigation-intro">
      <p>
        {{
          tr(
            '会话与侧栏都可使用。输入框内保留文字输入；会话输入框仅响应退出键和退出序列。大写键使用 Shift。',
            'Navigate from the conversation or either sidebar. Text fields keep ordinary typing; only exit bindings apply inside the message input. Use Shift for uppercase keys.',
          )
        }}
      </p>
    </header>
    <div class="navigation-rows">
      <div class="navigation-row">
        <label for="navigation-enabled">{{ tr('启用键盘导航', 'Enable keyboard navigation') }}</label
        ><SwitchRoot
          id="navigation-enabled"
          class="cfg-switch"
          :model-value="nav.enabled"
          @update:model-value="shortcuts.setNavigation({ ...nav, enabled: $event })"
          ><SwitchThumb class="cfg-switch-thumb"
        /></SwitchRoot>
      </div>
      <label v-for="action in actions" :key="action.id" class="navigation-row">
        <span>{{ action.label }}</span>
        <button
          type="button"
          class="navigation-binding navigation-key"
          :aria-label="action.label"
          @keydown="key($event, action.id)"
        >
          <KeyCaps v-if="nav.keys[action.id]" :label="nav.keys[action.id]" />
          <span v-else>{{ tr('未绑定', 'Unassigned') }}</span>
        </button>
      </label>
      <label class="navigation-row"
        ><span>{{ tr('退出输入的键序列', 'Sequence to leave input') }}</span
        ><input
          class="input navigation-binding"
          :value="nav.exitSequence"
          placeholder="ji"
          maxlength="6"
          autocomplete="off"
          spellcheck="false"
          @input="sequence"
      /></label>
      <label class="navigation-row"
        ><span>{{ tr('序列按键最大间隔（毫秒）', 'Maximum interval between keys (ms)') }}</span
        ><input
          class="input navigation-binding"
          type="number"
          min="100"
          max="2000"
          step="50"
          :value="nav.sequenceTimeout"
          @input="intervalInput"
          @change="interval"
      /></label>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer>
      <span>{{ tr('点击按键修改 · Backspace 停用', 'Click to bind · Backspace disables') }}</span
      ><button
        class="btn ghost sm"
        @click="
          shortcuts.setNavigation(defaultNavigation());
          error = '';
        "
      >
        {{ tr('恢复默认', 'Reset defaults') }}
      </button>
    </footer>
  </div>
</template>
<style scoped>
.navigation-editor {
  font-size: 13px;
}
.navigation-intro {
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 1.55;
  padding: 0 0 12px;
}
.navigation-intro p {
  margin: 0;
}
.navigation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 42px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line);
}
.navigation-row:first-child {
  padding-bottom: 10px;
  margin-bottom: 6px;
}
.navigation-row:nth-last-child(2) {
  margin-top: 12px;
  border-top: 1px solid var(--line);
}
.navigation-binding.input {
  width: 86px;
  flex: none;
  height: 30px;
  min-height: 30px;
  text-align: center;
  padding: 3px 8px;
  border-radius: 6px;
  font: 12px var(--mono);
}
.navigation-key {
  display: inline-flex;
  justify-content: flex-end;
  align-items: center;
  min-width: 44px;
  min-height: 36px;
  padding: 3px 0 3px 8px;
  border: 0;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  font: 12px var(--mono);
}
.navigation-key:focus-visible {
  outline: none;
}
.navigation-key:focus-visible :deep(.keycap) {
  border-color: var(--accent);
}
.navigation-key > span:not(.keycaps) {
  padding: 6px 8px;
  border: 1px dashed var(--line-strong);
  border-radius: 6px;
}
.navigation-key:focus-visible > span:not(.keycaps) {
  border-color: var(--accent);
}
@media (hover: hover) {
  .navigation-key:hover :deep(.keycap) {
    border-color: var(--accent);
  }
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  color: var(--fg-muted);
  font-size: 11px;
}
[role='alert'] {
  color: var(--err);
  font-size: 12px;
}
@media (max-width: 899px) {
  .navigation-editor {
    font-size: 14px;
  }
  .navigation-row {
    min-height: 48px;
  }
  .navigation-binding.input {
    height: 36px;
    min-height: 36px;
    font-size: 16px;
  }
  .navigation-key {
    min-height: 44px;
  }
}
</style>
