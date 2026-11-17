<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import { useModelCatalog } from '../../domain/providers/useModelCatalog.ts';
import { askBtw, btwSession } from '../../domain/chat/btwSessions.ts';
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
const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ close: []; btw: [] }>();
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
  {
    value: 'btw ',
    label: 'btw',
    hint: tr('临时提问；不带问题则打开上次回答', 'Ask aside; without a question, reopen the last answer'),
  },
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
  if ((name === 'model' || name === 'effort') && !args.length) {
    query.value = name + ' ';
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
  <CommandPanel :title="tr('命令面板', 'Command palette')" :busy="busy" @close="emit('close')">
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
          <span>{{ choice.label }}</span
          ><small>{{ choice.hint }}</small>
        </button>
      </div>
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
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.command-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 52px 16px 20px;
  border-bottom: 1px solid var(--line);
}
.command-input > span {
  color: var(--accent);
  font-size: 22px;
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
  padding: 6px;
  max-height: 42dvh;
}
.command-options button {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: start;
  padding: 10px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
}
.command-options button.active {
  background: var(--bg-hover);
}
.command-options span {
  overflow-wrap: anywhere;
}
.command-options small {
  color: var(--fg-subtle);
  margin-left: auto;
  text-align: end;
  font-size: 12px;
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--line);
  padding: 8px 16px;
  color: var(--fg-subtle);
  font-size: 11px;
}
.command-feedback {
  padding: 8px 18px;
  margin: 0;
  font-size: 13px;
}
.error {
  color: var(--err);
}
@media (max-width: 599px) {
  .command-options button {
    align-items: start;
    flex-direction: column;
    gap: 3px;
  }
  .command-options small {
    margin-left: 0;
    text-align: start;
  }
}
</style>
