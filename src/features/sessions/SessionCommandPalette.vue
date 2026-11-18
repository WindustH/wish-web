<script setup lang="ts">
import { useRouter } from 'vue-router';
import MatchText from '../../ui/components/MatchText.vue';
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import { useModelCatalog } from '../../domain/providers/useModelCatalog.ts';
import { askBtw, btwSession } from '../../domain/chat/btwSessions.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';
import { chat } from '../../core/state/chatSlice.ts';
import * as api from '../../core/api/endpoints.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import { toast } from '../../ui/toast.ts';
import {
  commandEfforts,
  parseSessionCommand,
  resolveCommandModel,
  validateCommandEffort,
  type CommandModel,
} from './sessionCommands.ts';
const router = useRouter();
const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ close: []; btw: [] }>();
const panel = ref<InstanceType<typeof CommandPanel>>();
const input = ref<HTMLInputElement>();
const query = ref('');
const selected = ref(0);
const busy = ref(false);
const error = ref('');
const catalog = useModelCatalog(false);
let mounted = true;
onScopeDispose(() => {
  mounted = false;
});
const models = computed<CommandModel[]>(() =>
  catalog.groups.value.flatMap((group) => group.models.map((model) => ({ provider: group.provider, model }))),
);
const commands = computed(() => [
  { value: 'new', label: 'new', hint: tr('打开新会话页面', 'Open a new session') },
  {
    value: 'btw ',
    label: 'btw',
    hint: tr('临时提问；不带问题则打开上次回答', 'Ask aside; without a question, reopen the last answer'),
  },
  { value: 'rename ', label: 'rename <name>', hint: tr('重命名当前会话', 'Rename this session') },
  { value: 'clear', label: 'clear', hint: tr('清空当前上下文，保留历史', 'Clear context, keep history') },
  { value: 'compact', label: 'compact', hint: tr('压缩当前上下文', 'Compact context') },
  {
    value: 'model ',
    label: 'model <model> [effort]',
    hint: tr('切换模型，可同时设置思考强度', 'Change model and optionally reasoning effort'),
  },
  {
    value: 'effort ',
    label: 'effort <level>',
    hint: tr('设置当前模型的思考强度', 'Set reasoning effort for the current model'),
  },
]);
const parsed = computed(() => parseSessionCommand(query.value));
let loadedCatalog = false;
watch(
  () => parsed.value.name,
  (name) => {
    if (!loadedCatalog && ['model', 'effort'].includes(name)) {
      loadedCatalog = true;
      void catalog.reload();
    }
  },
);
const choices = computed(() => {
  const { name, args } = parsed.value;
  const argumentsStarted = /\s/.test(query.value.trimStart());
  if (name === 'model' && argumentsStarted) {
    if (args.length > 1 || /\S\s+\S+\s+$/.test(query.value)) {
      const choice = resolveCommandModel(args[0] ?? '', models.value);
      return commandEfforts(choice.length === 1 ? choice[0] : undefined)
        .filter((level) => level.startsWith(args[1] ?? ''))
        .map((level) => ({
          value: `model ${args[0]} ${level}`,
          label: level,
          hint: tr('思考强度', 'Reasoning effort'),
        }));
    }
    const term = (args[0] ?? '').toLowerCase();
    return models.value
      .filter(({ provider, model }) =>
        `${provider.id}/${model.id} ${model.display_name ?? ''}`.toLowerCase().includes(term),
      )
      .map(({ provider, model }) => ({
        value: `model ${provider.id}/${model.id} `,
        label: model.id,
        hint: provider.display_name || provider.id,
      }));
  }
  if (name === 'effort' && argumentsStarted) {
    const current = chat.snapshot.value;
    const choice = models.value.find(
      (item) => item.provider.id === current?.provider && item.model.id === current?.model,
    );
    return commandEfforts(choice)
      .filter((level) => level.startsWith(args[0] ?? ''))
      .map((level) => ({ value: `effort ${level}`, label: level, hint: tr('思考强度', 'Reasoning effort') }));
  }
  if (argumentsStarted) return [];
  return commands.value.filter((command) => command.value.startsWith(name));
});
const matching = computed(() => {
  const { name, args } = parsed.value;
  if (/\s/.test(query.value.trimStart()))
    return name === 'model' && (args.length > 1 || /\S\s+\S+\s+$/.test(query.value))
      ? (args[1] ?? '')
      : (args[0] ?? '');
  return name;
});
const argumentHint = computed(() => {
  const { name } = parsed.value;
  if (!/\s/.test(query.value.trimStart())) return '';
  return (
    (
      {
        rename: tr('新名称 · 支持空格，按 Enter 保存', 'New name · Spaces allowed, Enter to save'),
        btw: tr('输入临时问题；留空重新打开上次回答', 'Ask aside, or leave empty to reopen the last answer'),
        model: tr(
          '模型 [思考强度] · 同名模型使用 provider/model',
          'model [effort] · Qualify duplicate names with provider/model',
        ),
        effort: tr('输入或选择思考强度', 'Enter or select reasoning effort'),
      } as Record<string, string>
    )[name] ?? ''
  );
});
const shown = computed(() => choices.value.slice(0, 80));
const catalogError = computed(() => catalog.error.value || catalog.groups.value.find((group) => group.error)?.error);
watch(query, () => {
  selected.value = 0;
  error.value = '';
});
watch(selected, async () => {
  await nextTick();
  document.getElementById(`session-command-option-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
});
function complete(index = selected.value) {
  const choice = shown.value[index];
  if (choice) query.value = choice.value;
  input.value?.focus();
}
async function execute() {
  if (busy.value) return;
  const { name, args, question } = parsed.value;
  if (!commands.value.some((command) => command.value.trim() === name)) {
    if (shown.value.length) complete();
    else error.value = tr('未知命令，请从补全列表选择。', 'Unknown command. Select a completion.');
    return;
  }
  if (['model', 'effort', 'rename'].includes(name) && !args.length) {
    if (name !== 'rename' && /\s$/.test(query.value) && shown.value.length) complete();
    else query.value = name + ' ';
    return;
  }
  const owner = props.sessionId;
  error.value = '';
  try {
    if (name === 'btw') {
      if (question && !askBtw(owner, question))
        throw new Error(tr('BTW 正在回答，请先等待或停止回答。', 'BTW is answering. Wait or stop the response first.'));
      btwSession(owner);
      emit('btw');
      emit('close');
      return;
    }
    if (name === 'new') {
      if (args.length) throw new Error(tr('new 不接受参数。', 'new does not accept arguments.'));
      busy.value = true;
      const failure = await router.push('/new');
      if (!failure && mounted) emit('close');
      return;
    }
    if (name === 'rename') {
      busy.value = true;
      const next = await sessions.rename(owner, question);
      if (chat.sessionId.value === owner) chat.adoptSnapshot(owner, next);
      toast(tr('会话已重命名', 'Session renamed'));
      if (mounted) emit('close');
      return;
    }
    if (name === 'model' || name === 'effort') {
      if (catalog.pending.value)
        throw new Error(tr('正在获取可用模型，请稍候。', 'Loading available models. Please wait.'));
      if (catalogError.value)
        throw new Error(
          tr('模型目录未完整加载，请重试后再选择。', 'The model catalog is incomplete. Retry before selecting.'),
        );
      if (args.length > (name === 'model' ? 2 : 1))
        throw new Error(
          tr(
            '参数过多。用法：model <模型> [思考强度] 或 effort <强度>。',
            'Too many arguments. Use model <model> [effort] or effort <level>.',
          ),
        );
      busy.value = true;
      const current = await api.sessionGet(owner);
      const matches =
        name === 'model'
          ? resolveCommandModel(args[0]!, models.value)
          : models.value.filter((item) => item.provider.id === current.provider && item.model.id === current.model);
      if (matches.length !== 1)
        throw new Error(
          matches.length > 1
            ? tr(
                '模型名称有歧义，请使用 provider/模型，或从补全列表选择。',
                'Ambiguous model. Use provider/model or select a completion.',
              )
            : tr(
                '可用列表中没有这个模型，请从补全列表选择。',
                'Model not found. Select an available model from completions.',
              ),
        );
      const choice = matches[0]!;
      const effort = name === 'effort' ? args[0] : args[1];
      if (effort && !validateCommandEffort(effort, choice))
        throw new Error(
          tr(
            '此模型不支持这个思考强度，请从补全列表选择。',
            'This model does not support that effort. Select a completion.',
          ),
        );
      const next = await api.sessionUpdateModel(
        owner,
        {
          ...(name === 'model' ? { provider: choice.provider.id, model: choice.model.id } : {}),
          ...(effort ? { reasoning_effort: effort } : {}),
        },
        current.revision,
      );
      if (chat.sessionId.value === owner) {
        chat.adoptSnapshot(owner, next);
        await chat.reloadCapabilities();
      }
      toast(tr('已更新会话模型设置', 'Session model settings updated'));
    } else {
      if (args.length) throw new Error(tr('此命令不接受参数。', 'This command does not accept arguments.'));
      busy.value = true;
      if (name === 'clear') {
        await api.sessionClearContext(owner);
        if (chat.sessionId.value === owner) await chat.reload();
      } else await api.sessionCompact(owner);
      toast(
        name === 'clear'
          ? tr('上下文已清空，历史记录仍然保留', 'Context cleared. History is kept.')
          : tr('已开始压缩上下文', 'Compaction started'),
      );
    }
    if (mounted) emit('close');
  } catch (cause) {
    error.value = describeError(cause).message;
  } finally {
    busy.value = false;
  }
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (
    event.key === 'Backspace' &&
    query.value === '' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    event.stopPropagation();
    panel.value?.close();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selected.value = Math.max(
      0,
      Math.min(shown.value.length - 1, selected.value + (event.key === 'ArrowDown' ? 1 : -1)),
    );
  } else if (event.key === 'Tab' && shown.value.length) {
    event.preventDefault();
    complete();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void execute();
  }
}
</script>
<template>
  <CommandPanel compact ref="panel" :title="tr('命令面板', 'Command palette')" :busy="busy" @close="emit('close')">
    <div class="session-commands" data-keyboard-boundary>
      <div class="command-input">
        <span aria-hidden="true">:</span
        ><input
          ref="input"
          v-model="query"
          data-initial-focus
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="!!shown.length"
          aria-controls="session-command-options"
          :aria-activedescendant="shown[selected] ? `session-command-option-${selected}` : undefined"
          :aria-label="tr('输入命令', 'Enter command')"
          :placeholder="tr('输入命令…', 'Enter command…')"
          :disabled="busy"
          autocomplete="off"
          spellcheck="false"
          @keydown="keydown"
        />
      </div>
      <div
        id="session-command-options"
        class="command-options"
        role="listbox"
        :aria-label="tr('命令补全', 'Command completions')"
      >
        <button
          v-for="(choice, index) in shown"
          :id="`session-command-option-${index}`"
          :key="choice.value"
          role="option"
          :aria-selected="selected === index"
          :class="{ active: selected === index }"
          :disabled="busy"
          @mousedown.prevent
          @click="complete(index)"
        >
          <span class="completion-name" :title="choice.label"
            ><MatchText :text="choice.label" :query="matching"
          /></span>
          <small :title="choice.hint"><MatchText :text="choice.hint" :query="matching" /></small>
          <kbd :class="{ visible: selected === index }" aria-hidden="true">⇥</kbd>
        </button>
      </div>
      <p v-if="argumentHint" class="command-argument-hint">{{ argumentHint }}</p>
      <p
        v-if="!shown.length && ['model', 'effort'].includes(parsed.name) && !catalog.pending.value"
        class="command-feedback"
      >
        {{ tr('没有匹配项', 'No matches') }}
      </p>
      <p v-if="error" class="command-feedback error" role="alert">{{ error }}</p>
      <p v-if="['model', 'effort'].includes(parsed.name) && catalogError" class="command-feedback error" role="alert">
        {{ tr('无法完整获取模型目录', 'Could not load the complete model catalog') }}
        <button class="btn ghost" @click="catalog.reload">{{ tr('重试', 'Retry') }}</button>
      </p>
      <footer>
        <span>{{
          busy
            ? tr('执行中…', 'Working…')
            : catalog.pending.value && ['model', 'effort'].includes(parsed.name)
              ? tr('正在获取可用模型…', 'Loading available models…')
              : tr('Tab 补全 · ↑ ↓ 选择 · Esc 关闭', 'Tab complete · ↑ ↓ select · Esc close')
        }}</span
        ><button class="btn ghost" :disabled="busy || !query.trim()" @click="execute">{{ tr('执行', 'Run') }} ↵</button>
      </footer>
    </div>
  </CommandPanel>
</template>
<style scoped>
.session-commands {
  min-height: 0;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.command-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  min-height: 44px;
  padding: 8px 42px 8px 14px;
  font: 14px/1.5 var(--mono);
  border-bottom: 1px solid var(--line);
}
.command-input > span {
  color: var(--accent);
}
.command-input input {
  width: 100%;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  font: inherit;
}
.command-options {
  overflow: auto;
  min-height: 0;
  padding: 4px;
  max-height: 40dvh;
  font: 12px/1.5 var(--mono);
}
.command-options:empty {
  display: none;
}
.command-options button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: start;
  min-height: 32px;
  padding: 6px 10px;
  font: inherit;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--fg);
}
.command-options button.active {
  background: var(--accent-soft);
}
.command-options button.active .completion-name,
.command-options button.active kbd {
  color: var(--accent);
}
@media (hover: hover) {
  .command-options button:not(.active):hover {
    background: var(--bg-hover);
  }
}
.completion-name {
  font-weight: 500;
}
.command-options kbd {
  visibility: hidden;
  font: 12px var(--mono);
  color: var(--fg-subtle);
}
.command-options kbd.visible {
  visibility: visible;
}
.command-argument-hint {
  margin: 0;
  padding: 6px 14px;
  font-size: 11px;
  color: var(--fg-muted);
}
.command-options .completion-name,
.command-options small {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.command-options small {
  color: var(--fg-subtle);
  text-align: end;
  font: 11px/1.5 var(--mono);
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--line);
  flex: none;
  min-height: 32px;
  padding: 3px 10px 3px 14px;
  color: var(--fg-subtle);
  font-size: 11px;
}
footer .btn {
  min-height: 26px;
  padding: 3px 7px;
  font-size: 11px;
}
.command-feedback {
  padding: 6px 14px;
  margin: 0;
  font-size: 13px;
}
.error {
  color: var(--err);
}
@media (pointer: coarse), (max-width: 599px) {
  .command-input {
    min-height: 48px;
    font-size: 16px;
  }
  .command-options button {
    min-height: 40px;
  }
  footer .btn {
    min-height: 36px;
  }
}
</style>
