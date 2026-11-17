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
const nav = computed(() => shortcuts.value.value.navigation);
const error = ref('');
const actions = computed<{ id: NavigationAction; label: string }[]>(() => [
  { id: 'focus', label: tr('聚焦消息输入框', 'Focus message input') },
  { id: 'exit', label: tr('退出消息输入框', 'Leave message input') },
  { id: 'down', label: tr('向下滚动对话', 'Scroll conversation down') },
  { id: 'up', label: tr('向上滚动对话', 'Scroll conversation up') },
  { id: 'nextMessage', label: tr('下一条消息', 'Next message') },
  { id: 'previousMessage', label: tr('上一条消息', 'Previous message') },
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
</script>
<template>
  <details class="set-section navigation-settings">
    <summary>{{ tr('高级设置', 'Advanced settings') }}</summary>
    <header class="set-section-head">
      <p>
        {{
          tr(
            '未编辑文本时使用字母导航。大写键使用 Shift；输入框中仅退出键与退出序列生效。',
            'Letter navigation works outside text fields. Use Shift for uppercase keys. Only exit bindings apply inside the message input.',
          )
        }}
      </p>
    </header>
    <div class="set-card">
      <div class="set-row inline">
        <label for="navigation-enabled">{{ tr('启用键盘导航', 'Enable keyboard navigation') }}</label
        ><SwitchRoot
          id="navigation-enabled"
          class="cfg-switch"
          :model-value="nav.enabled"
          @update:model-value="shortcuts.setNavigation({ ...nav, enabled: $event })"
          ><SwitchThumb class="cfg-switch-thumb"
        /></SwitchRoot>
      </div>
      <label v-for="action in actions" :key="action.id" class="set-row inline">
        <span>{{ action.label }}</span>
        <input
          class="input navigation-binding"
          readonly
          :value="nav.keys[action.id] || tr('未绑定', 'Unassigned')"
          :aria-label="action.label"
          @keydown="key($event, action.id)"
        />
      </label>
      <label class="set-row inline"
        ><span>{{ tr('退出输入的键序列', 'Sequence to leave input') }}</span
        ><input
          class="input navigation-binding"
          :value="nav.exitSequence"
          placeholder="ji"
          maxlength="6"
          autocomplete="off"
          spellcheck="false"
          @change="sequence"
      /></label>
      <label class="set-row inline"
        ><span>{{ tr('序列按键最大间隔（毫秒）', 'Maximum interval between keys (ms)') }}</span
        ><input
          class="input navigation-binding"
          type="number"
          min="100"
          max="2000"
          step="50"
          :value="nav.sequenceTimeout"
          @change="
            shortcuts.setNavigation({ ...nav, sequenceTimeout: Number(($event.target as HTMLInputElement).value) })
          "
      /></label>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <button class="btn ghost" @click="shortcuts.setNavigation(defaultNavigation())">
      {{ tr('恢复导航默认设置', 'Reset navigation defaults') }}
    </button>
  </details>
</template>
<style scoped>
summary {
  cursor: pointer;
  font-weight: 600;
  padding-block: 12px;
}
.set-row > .navigation-binding {
  width: 120px;
  text-align: center;
  flex: none;
}
.set-row {
  grid-template-columns: minmax(0, 1fr) auto;
  justify-content: space-between;
  gap: 12px;
}
[role='alert'] {
  color: var(--err);
}
</style>
