<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import {
  defaultBindings,
  defaultNavigation,
  keyBinding,
  navigationBinding,
  readShortcuts,
  sameBinding,
  shortcutLabel,
  validBinding,
  validNavigationKey,
  type ShortcutId,
  type NavigationAction,
  type KeyBinding,
} from '../../core/shortcuts.ts';
import { appActions, navigationActions } from './keymapActions.ts';
import Icon from '../../ui/components/Icon.vue';
import KeymapNavigationOptions from './KeymapNavigationOptions.vue';
import KeyCaps from '../../ui/components/KeyCaps.vue';
import SelectField from '../../ui/components/SelectField.vue';

type Action = ShortcutId | NavigationAction;
interface Row {
  id: Action;
  index: number;
  binding: KeyBinding | string | null;
  context: string;
  label: string;
  base: boolean;
}
const isApp = (action: Action): action is ShortcutId => Object.hasOwn(defaultBindings, action);
const navDefaults = defaultNavigation();
const actions = computed(() => [
  ...appActions.value.map((a) => ({
    value: a.id as Action,
    label: a.label,
    context: a.hint || tr('应用', 'Application'),
  })),
  ...navigationActions.value.map((a) => ({
    value: a.id as Action,
    label: a.label,
    context:
      a.id === 'exit'
        ? tr('输入框', 'Message input')
        : a.id === 'openItem'
          ? tr('会话列表 / 侧栏', 'Session list / sidebar')
          : tr('键盘导航', 'Keyboard navigation'),
  })),
]);
const settings = computed(() => shortcuts.value.value);
const query = ref('');
const display = (b: Row['binding']) => (typeof b === 'string' ? b : b ? shortcutLabel(b) : '');
const rows = computed(() => {
  const p = settings.value;
  const result: Row[] = [];
  for (const a of actions.value) {
    const id = a.value;
    const primary = isApp(id) ? p.bindings[id] : p.navigation.keys[id];
    result.push({
      ...a,
      id,
      index: -1,
      binding: primary,
      base: isApp(id) ? sameBinding(p.bindings[id], defaultBindings[id]) : primary === navDefaults.keys[id],
    });
    if (isApp(id))
      p.alternates.forEach((r, i) => {
        if (r.action === id) result.push({ ...a, id, index: i, binding: r.binding, base: false });
      });
    else
      p.navigation.alternates.forEach((r, i) => {
        if (r.action === id)
          result.push({
            ...a,
            id,
            index: i,
            binding: r.key,
            base: navDefaults.alternates.some((d) => d.action === id && d.key === r.key),
          });
      });
  }
  return result;
});
const filtered = computed(() =>
  rows.value.filter((r) =>
    [r.label, r.id, r.context, display(r.binding)].join(' ').toLowerCase().includes(query.value.trim().toLowerCase()),
  ),
);
const editing = ref<{ id: Action; index: number; adding: boolean } | null>(null);
const recorder = ref<HTMLButtonElement>();
const focusAfterSelection = ref(false);
function restoreRecorder(event: Event) {
  if (!focusAfterSelection.value || !recorder.value) return;
  focusAfterSelection.value = false;
  event.preventDefault();
  recorder.value.focus();
}
const error = ref('');
function begin(id: Action, index: number, adding = false) {
  editing.value = { id, index, adding };
  error.value = '';
  void nextTick(() => recorder.value?.focus());
}
function cancel() {
  editing.value = null;
  error.value = '';
}
function assign(id: Action, index: number, value: string | KeyBinding | null, adding = false) {
  const p = readShortcuts(settings.value);
  if (isApp(id)) {
    const binding = typeof value === 'object' ? value : null;
    if (adding && binding && p.bindings[id]) p.alternates.push({ action: id, binding });
    else if (index < 0) p.bindings[id] = binding;
    else p.alternates.splice(index, 1, ...(binding ? [{ action: id, binding }] : []));
  } else {
    const key = typeof value === 'string' ? value : '';
    if (adding && key && p.navigation.keys[id]) p.navigation.alternates.push({ action: id, key });
    else if (index < 0) p.navigation.keys[id] = key;
    else p.navigation.alternates.splice(index, 1, ...(key ? [{ action: id, key }] : []));
  }
  shortcuts.restore(p);
  cancel();
}
function record(e: KeyboardEvent) {
  const edit = editing.value;
  if (!edit || (e.key === 'Tab' && !isApp(edit.id))) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat || e.isComposing || e.keyCode === 229 || ['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;
  if (e.key === 'Escape' && edit.id !== 'exit') {
    cancel();
    return;
  }
  const combo = keyBinding(e);
  const app = isApp(edit.id);
  if (app ? !validBinding(combo) : e.ctrlKey || e.metaKey || e.altKey || !validNavigationKey(e.key)) {
    error.value = app
      ? tr('使用组合键、Tab 或 F1–F12。', 'Use a modifier combination, Tab or F1–F12.')
      : tr('使用单个字符、Enter、Esc 或 F1–F12。', 'Use a character, Enter, Esc or F1–F12.');
    return;
  }
  const conflict = rows.value.find((r) => {
    if (!r.binding || (!edit.adding && r.id === edit.id && r.index === edit.index)) return false;
    if (typeof r.binding === 'string' && !app) return r.binding === e.key;
    return sameBinding(typeof r.binding === 'string' ? navigationBinding(r.binding) : r.binding, combo);
  });
  if (conflict) {
    error.value = tr(`此按键已绑定「${conflict.label}」。`, `Already bound to ${conflict.label}.`);
    return;
  }
  assign(edit.id, edit.index, app ? combo : e.key, edit.adding);
}
function reset() {
  const defaults = defaultNavigation();
  shortcuts.restore({
    ...settings.value,
    bindings: defaultBindings,
    alternates: [],
    navigation: { ...settings.value.navigation, keys: defaults.keys, alternates: defaults.alternates },
  });
  cancel();
}
</script>
<template>
  <section class="keymap" data-keyboard-boundary>
    <KeymapNavigationOptions />
    <div class="map-toolbar">
      <label class="map-search"
        ><Icon name="search" :size="16" /><input
          type="search"
          v-model="query"
          :aria-label="tr('筛选绑定', 'Filter bindings')"
          :placeholder="tr('搜索动作或按键…', 'Find action or key…')"
      /></label>
      <button class="btn sm" @click="begin(filtered[0]?.id ?? 'openSettings', -1, true)">
        <Icon name="plus" :size="15" />{{ tr('添加绑定', 'Add binding') }}
      </button>
      <button
        class="btn ghost icon-only"
        @click="reset"
        :aria-label="tr('恢复默认绑定', 'Restore default bindings')"
        :title="tr('恢复默认绑定', 'Restore default bindings')"
      >
        <Icon name="undo" :size="16" />
      </button>
    </div>
    <div v-if="editing" class="map-edit">
      <SelectField
        v-if="editing.adding"
        v-model="editing.id"
        :options="actions"
        :aria-label="tr('动作', 'Action')"
        @update:model-value="
          error = '';
          focusAfterSelection = true;
        "
        @close-auto-focus="restoreRecorder"
      />
      <span v-else>{{ actions.find((a) => a.value === editing?.id)?.label }}</span>
      <button ref="recorder" type="button" class="btn sm record" data-navigation-ignore @keydown="record">
        {{ tr('请按快捷键…', 'Press keys…') }}
      </button>
      <button class="btn ghost icon-only" :aria-label="tr('取消', 'Cancel')" @click="cancel">
        <Icon name="x" :size="16" />
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <table>
      <thead>
        <tr>
          <th>{{ tr('动作', 'Action') }}</th>
          <th>{{ tr('按键', 'Keystroke') }}</th>
          <th class="context">{{ tr('作用范围', 'Context') }}</th>
          <th class="source">{{ tr('来源', 'Source') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id + ':' + r.index" :data-shortcut="r.id">
          <td>{{ r.label }}</td>
          <td>
            <button
              class="binding"
              :aria-label="r.label + ' · ' + (display(r.binding) || tr('未绑定', 'Unbound'))"
              @click="begin(r.id, r.index)"
            >
              <KeyCaps v-if="r.binding" :label="display(r.binding)" /><span v-else>—</span>
            </button>
          </td>
          <td class="context">{{ r.context }}</td>
          <td class="source">{{ r.base ? tr('默认', 'Default') : tr('自定义', 'User') }}</td>
          <td>
            <button
              class="btn ghost icon-only"
              :disabled="!r.binding"
              :aria-label="tr('移除绑定', 'Remove binding') + ' · ' + r.label"
              @click="assign(r.id, r.index, null)"
            >
              <Icon name="x" :size="14" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!filtered.length">{{ tr('没有匹配的绑定。', 'No matching bindings.') }}</p>
  </section>
</template>
<style scoped>
.keymap {
  container-type: inline-size;
  font-size: 13px;
}
.map-toolbar,
.map-edit,
.map-search {
  display: flex;
  align-items: center;
  gap: 8px;
}
.map-toolbar {
  margin-bottom: 12px;
}
.map-search {
  flex: 1;
  min-width: 60px;
  border-bottom: 1px solid var(--line-strong);
  color: var(--fg-muted);
  padding: 5px;
}
.map-search input {
  border: 0;
  background: transparent;
  color: var(--fg);
  width: 100%;
  min-width: 0;
  font: inherit;
}
.map-edit {
  flex-wrap: wrap;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 7px;
}
.record {
  color: var(--accent);
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
th,
td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--line);
}
th {
  font-size: 11px;
  color: var(--fg-muted);
  font-weight: 500;
}
.context,
.source {
  font-size: 12px;
  color: var(--fg-muted);
}
td:last-child {
  width: 28px;
}
.binding {
  background: none;
  border: 0;
  color: inherit;
  padding: 3px;
  cursor: pointer;
}
.binding :deep(.keycap) {
  height: 24px;
  min-width: 21px;
  padding: 0 5px;
  border-bottom-width: 2px;
  font-size: 11px;
}
.binding :deep(.keycaps) {
  gap: 2px;
}
@media (pointer: coarse) {
  .binding {
    min-height: 44px;
    min-width: 44px;
  }
}
.keymap [role='alert'] {
  color: var(--err);
}
tbody tr:focus-within,
tbody tr:hover {
  background: var(--bg-raised);
}
@container (max-width:600px) {
  .source {
    display: none;
  }
}
@container (max-width:440px) {
  .context {
    display: none;
  }
  td,
  th {
    padding-inline: 3px;
  }
}
</style>
