<script setup lang="ts">
// Clearing history the sessions' context no longer uses, with the files only that history named.
// The range picks how old it must be; what would go is measured first and shown before it goes.
import { errorText } from '../../core/errors.ts';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { bus } from '../../core/bus.ts';
import Modal from '../../ui/components/Modal.vue';
import * as api from '../../core/api/endpoints.ts';
import type { PruneResult } from '../../core/api/endpoints.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { toast } from '../../ui/toast.ts';

const props = defineProps<{
  // The sessions to clear; null clears every one of them.
  targets: { id: string; name: string }[] | null;
  // How many sessions there are, to say what "all" means.
  total: number;
  defaultMode?: 'clear' | 'archive';
}>();
const emit = defineEmits<{ close: []; pruned: [result: PruneResult] }>();

const mode = ref(props.defaultMode ?? 'clear');
const modes = computed(() => [
  { value: 'clear', label: tr('直接清理', 'Clear directly') },
  { value: 'archive', label: tr('归档并清理', 'Archive and clear') },
]);
const DAY = 86_400_000;
const ranges = computed(() => [
  { value: 'all', label: tr('全部', 'All') },
  { value: '7', label: tr('7 天前', '7 days ago') },
  { value: '30', label: tr('30 天前', '30 days ago') },
  { value: '90', label: tr('90 天前', '90 days ago') },
  { value: 'date', label: tr('指定日期', 'Pick a date') },
]);
const range = ref('all');
const localDate = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const today = localDate(Date.now());
const date = ref(localDate(Date.now() - 30 * DAY));
// Unix ms: history recorded before it goes. Null: everything the context does not use.
const before = computed<number | null | undefined>(() => {
  if (range.value === 'all') return null;
  if (range.value !== 'date') return Date.now() - Number(range.value) * DAY;
  const [year, month, day] = date.value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day).getTime() : undefined;
});

const scope = computed(() => {
  const targets = props.targets;
  if (!targets) return tr(`全部 ${props.total} 个会话`, `All ${props.total} session${props.total === 1 ? '' : 's'}`);
  if (targets.length === 1) return tr(`会话「${targets[0]!.name}」`, `“${targets[0]!.name}”`);
  return tr(`已选的 ${targets.length} 个会话`, `${targets.length} selected sessions`);
});
const body = () => ({
  ...(props.targets ? { sessions: props.targets.map((item) => item.id) } : {}),
  before: before.value,
});

// What the current range would clear, measured again whenever the range changes.
const preview = ref<PruneResult>();
const measuring = ref(false);
const failed = ref('');
let measuringRequest: AbortController | undefined;
let pruneRequest: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
async function measure() {
  if (before.value === undefined) {
    preview.value = undefined;
    measuring.value = false;
    return;
  }
  measuring.value = true;
  failed.value = '';
  const own = (measuringRequest = new AbortController());
  try {
    const result = await api.storagePrune({ ...body(), dry_run: true }, { signal: own.signal });
    if (!own.signal.aborted) preview.value = result;
  } catch (error) {
    if (!own.signal.aborted) {
      preview.value = undefined;
      failed.value = errorText(error);
    }
  } finally {
    if (!own.signal.aborted) measuring.value = false;
  }
}
watch(
  [range, date],
  () => {
    clearTimeout(timer);
    measuringRequest?.abort();
    preview.value = undefined;
    measuring.value = true;
    timer = setTimeout(measure, 250);
  },
  { immediate: false },
);
void measure();
onBeforeUnmount(() => {
  clearTimeout(timer);
  measuringRequest?.abort();
  pruneRequest?.abort();
});

const empty = computed(
  () =>
    preview.value != null && preview.value.bytes.total === 0 && !preview.value.files && !preview.value.stale_entries,
);
const skipped = computed(() => preview.value?.skipped.length ?? 0);
const details = computed(() => {
  const found = preview.value;
  if (!found) return '';
  return [
    found.messages ? tr(`${found.messages} 条消息`, `${found.messages} message${found.messages === 1 ? '' : 's'}`) : '',
    found.events ? tr(`${found.events} 条运行记录`, `${found.events} run event${found.events === 1 ? '' : 's'}`) : '',
    found.files ? tr(`${found.files} 个文件`, `${found.files} file${found.files === 1 ? '' : 's'}`) : '',
    found.stale_entries
      ? tr(
          `${found.stale_entries} 条失效记录`,
          `${found.stale_entries} stale entr${found.stale_entries === 1 ? 'y' : 'ies'}`,
        )
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
});

const pruning = ref(false);
async function prune() {
  if (pruning.value || measuring.value || !preview.value || empty.value) return;
  pruning.value = true;
  failed.value = '';
  const own = (pruneRequest = new AbortController());
  try {
    const archive = mode.value === 'archive';
    const result = await api.storagePrune({ ...body(), ...(archive ? { archive: true } : {}) }, { signal: own.signal });
    if (own.signal.aborted) return;
    const freed = Math.max(0, (result.database?.before ?? 0) - (result.database?.after ?? 0)) + result.bytes.files;
    const skipped = result.skipped.length;
    const stale = result.stale_entries ?? 0;
    const archives = result.archives?.length ?? 0;
    const size = fmtBytes(freed);
    if (archives) bus.emit('archives.changed');
    const messages = [tr(`已清理，释放了 ${size}。`, `Cleared, ${size} freed.`)];
    if (archives)
      messages.unshift(
        tr(`已创建 ${archives} 份历史归档。`, `Created ${archives} history archive${archives === 1 ? '' : 's'}.`),
      );
    if (stale)
      messages.push(tr(`已移除 ${stale} 条失效记录。`, `Removed ${stale} stale entr${stale === 1 ? 'y' : 'ies'}.`));
    if (skipped)
      messages.push(tr(`已跳过 ${skipped} 个会话。`, `Skipped ${skipped} session${skipped === 1 ? '' : 's'}.`));
    if (result.unreadable_jobs)
      messages.push(
        tr(
          '部分生成记录无法读取，相关会话的文件已保留。',
          'Files in sessions with unreadable generation records were kept.',
        ),
      );
    toast(messages.join(i18n.locale.value === 'zh' ? '' : ' '));
    emit('pruned', result);
  } catch (error) {
    if (!own.signal.aborted) failed.value = errorText(error);
  } finally {
    pruning.value = false;
  }
}
function cancel() {
  if (pruning.value) {
    pruneRequest?.abort();
    toast(
      tr(
        '已停止等待。已提交的清理可能仍在服务端运行。',
        'Stopped waiting. Submitted cleanup may still finish on the server.',
      ),
    );
  }
  emit('close');
}
</script>

<template>
  <Modal compact :open="true" :dismissable="!pruning" :title="tr('清理历史', 'Clear history')" @close="emit('close')">
    <div class="prune">
      <p class="prune-scope">{{ scope }}</p>
      <SelectField
        :model-value="mode"
        :options="modes"
        segmented="always"
        :disabled="pruning"
        @update:model-value="mode = $event as 'clear' | 'archive'"
      />
      <p v-if="mode === 'archive'" class="prune-what">
        {{
          tr(
            '先把待清理的旧历史和关联文件保存到「存储 → 已归档」。当前对话和库中可见文件会保留。',
            'Save unused history and its files to Storage → Archived before clearing. Current context and visible Library files are kept.',
          )
        }}
      </p>
      <p v-else class="prune-what">
        {{
          tr(
            '清理当前上下文已经不再使用的消息和运行记录，以及只被它们引用的隐藏附件、图片和命令输出。上下文里的内容和库中可见的文件都会保留，对话可以照常继续。',
            'Clears messages and run events no longer used by the current context, with hidden attachments, images and command output only they refer to. Current context and visible Library files are kept.',
          )
        }}
      </p>

      <fieldset class="prune-range">
        <legend>{{ tr('清理多久以前的', 'Clear what is older than') }}</legend>
        <div class="prune-choices" role="radiogroup">
          <button
            v-for="item in ranges"
            :key="item.value"
            type="button"
            role="radio"
            :aria-checked="range === item.value"
            :disabled="pruning"
            @click="range = item.value"
          >
            {{ item.label }}
          </button>
        </div>
        <label v-if="range === 'date'" class="prune-date">
          <span>{{ tr('早于', 'Before') }}</span>
          <input v-model="date" type="date" class="input" :max="today" :disabled="pruning" />
        </label>
      </fieldset>

      <div class="prune-estimate" :class="{ quiet: empty }" aria-live="polite">
        <template v-if="preview && !measuring">
          <template v-if="empty">{{ tr('没有可以清理的历史。', 'There is no history to clear.') }}</template>
          <template v-else>
            <span>{{
              mode === 'archive'
                ? tr('预计归档的原始数据', 'Uncompressed data to archive')
                : tr('预计释放', 'About to free')
            }}</span>
            <strong>{{ fmtBytes(preview.bytes.total) }}</strong>
            <small v-if="details">{{ details }}</small>
          </template>
        </template>
        <span v-else-if="measuring || before !== undefined" class="prune-measuring"
          ><Icon name="loader-circle" class="spin" />{{ tr('正在计算…', 'Measuring…') }}</span
        >
        <template v-else>{{ tr('选择一个日期。', 'Pick a date.') }}</template>
      </div>
      <p v-if="skipped && !measuring" class="prune-note">
        {{
          tr(
            `${skipped} 个会话正在运行，这次会跳过。`,
            `${skipped} running session${skipped === 1 ? ' is' : 's are'} skipped.`,
          )
        }}
      </p>
      <p v-if="preview?.unreadable_jobs && !measuring" class="prune-note" role="status">
        {{
          tr(
            `${preview.unreadable_jobs} 条生成记录无法读取；相关会话的隐藏文件和生成记录已保留。`,
            `${preview.unreadable_jobs} generation records could not be read; hidden files and generation records in the affected sessions were kept.`,
          )
        }}
      </p>
      <p v-if="failed" class="prune-error" role="alert">{{ failed }}</p>
      <p v-if="mode === 'clear'" class="prune-note">
        {{
          tr(
            '清理后无法恢复：这些历史不再出现在对话记录和历史搜索里。',
            'This cannot be undone: the cleared history no longer shows in the conversation or in history search.',
          )
        }}
      </p>
    </div>
    <template #footer>
      <button class="btn ghost" @click="cancel">
        {{ pruning ? tr('停止等待', 'Stop waiting') : tr('取消', 'Cancel') }}
      </button>
      <button
        class="btn"
        :class="mode === 'archive' ? 'primary' : 'danger solid'"
        :disabled="pruning || measuring || !preview || empty"
        @click="prune"
      >
        <Icon v-if="pruning" name="loader-circle" class="spin" /><Icon
          v-else
          :name="mode === 'archive' ? 'archive' : 'eraser'"
        />{{ mode === 'archive' ? tr('归档并清理', 'Archive and clear') : tr('清理', 'Clear') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.prune {
  display: grid;
  gap: 14px;
}
.prune p {
  margin: 0;
}
.prune-scope {
  color: var(--fg);
  font-weight: 500;
}
.prune-what {
  color: var(--fg-muted);
  font-size: 13px;
  line-height: 1.6;
}
.prune-range {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.prune-range legend {
  margin-bottom: 8px;
  padding: 0;
  color: var(--fg-muted);
  font-size: 12.5px;
}
.prune-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.prune-choices button {
  padding: 6px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition:
    background var(--dur-fast),
    color var(--dur-fast),
    border-color var(--dur-fast);
}
@media (hover: hover) {
  .prune-choices button:hover:not(:disabled) {
    color: var(--fg);
    border-color: var(--fg-subtle);
  }
}
.prune-choices button[aria-checked='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.prune-choices button:disabled {
  cursor: default;
  opacity: 0.6;
}
.prune-date {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--fg-muted);
  font-size: 13px;
}
.prune-date .input {
  width: auto;
  min-width: 0;
}
.prune-estimate {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  min-height: 64px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-sunken);
  color: var(--fg-muted);
  font-size: 13px;
  align-content: center;
}
.prune-estimate strong {
  color: var(--fg);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.prune-estimate small {
  flex-basis: 100%;
  color: var(--fg-subtle);
  font-size: 12.5px;
}
.prune-measuring {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.prune-measuring .icon {
  width: 16px;
  height: 16px;
}
.prune-note {
  color: var(--fg-subtle);
  font-size: 12.5px;
  line-height: 1.55;
}
.prune-error {
  color: var(--danger);
  font-size: 12.5px;
}
</style>
