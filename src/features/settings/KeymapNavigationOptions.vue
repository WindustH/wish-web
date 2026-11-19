<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import { defaultNavigation } from '../../core/shortcuts.ts';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
const nav = computed(() => shortcuts.value.value.navigation);
const error = ref('');
const sequenceDraft = ref(nav.value.exitSequence);
const intervalDraft = ref(String(nav.value.sequenceTimeout));
watch(
  () => nav.value.exitSequence,
  (value) => {
    sequenceDraft.value = value;
  },
);
watch(
  () => nav.value.sequenceTimeout,
  (value) => {
    intervalDraft.value = String(value);
  },
);
function sequence(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  sequenceDraft.value = value;
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
  intervalDraft.value = (event.target as HTMLInputElement).value;
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
  if (input.value !== '') shortcuts.setNavigation({ ...nav.value, sequenceTimeout: Number(input.value) });
  intervalDraft.value = String(nav.value.sequenceTimeout);
  input.value = intervalDraft.value;
  error.value = '';
}
function resetOptions() {
  shortcuts.setNavigation({ ...defaultNavigation(), keys: nav.value.keys, alternates: nav.value.alternates });
  sequenceDraft.value = nav.value.exitSequence;
  intervalDraft.value = String(nav.value.sequenceTimeout);
  error.value = '';
}
</script>
<template>
  <div class="navigation-editor" data-keyboard-boundary>
    <header>
      <h3>{{ tr('键盘导航', 'Keyboard navigation') }}</h3>
      <button
        type="button"
        class="btn ghost icon-only sm"
        :aria-label="tr('恢复导航选项默认值', 'Reset navigation options')"
        :title="tr('恢复导航选项默认值', 'Reset navigation options')"
        @click="resetOptions"
      >
        <Icon name="undo" :size="15" />
      </button>
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
      <div class="navigation-row">
        <label for="focus-indicator">{{ tr('区域焦点指示器', 'Region focus indicator') }}</label>
        <SwitchRoot
          id="focus-indicator"
          class="cfg-switch"
          :model-value="nav.indicator"
          @update:model-value="shortcuts.setNavigation({ ...nav, indicator: $event })"
          ><SwitchThumb class="cfg-switch-thumb"
        /></SwitchRoot>
      </div>
      <label class="navigation-row"
        ><span>{{ tr('退出输入的键序列', 'Sequence to leave input') }}</span
        ><input
          class="input navigation-binding"
          :value="sequenceDraft"
          placeholder="ji"
          maxlength="6"
          autocomplete="off"
          spellcheck="false"
          @input="sequence"
          @change="
            sequenceDraft = nav.exitSequence;
            error = '';
          "
      /></label>
      <label class="navigation-row"
        ><span>{{ tr('序列按键最大间隔（毫秒）', 'Maximum interval between keys (ms)') }}</span
        ><input
          class="input navigation-binding"
          type="number"
          min="100"
          max="2000"
          step="50"
          :value="intervalDraft"
          @input="intervalInput"
          @change="interval"
      /></label>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.navigation-editor {
  font-size: 13px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h3 {
  font-size: 13px;
  margin: 0;
}
.navigation-editor {
  margin: 0 0 18px;
}
.navigation-rows {
  display: grid;
  column-gap: 24px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@container (max-width: 550px) {
  .navigation-rows {
    grid-template-columns: 1fr;
  }
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
}
</style>
