<script setup lang="ts">
// Clearing history the sessions' context no longer uses, with the files only that history named.
// The range picks how old it must be; what would go is measured first and shown before it goes.
import { errorText } from '../../core/errors.ts';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import * as api from '../../core/api/endpoints.ts';
import type { PruneResult } from '../../core/api/endpoints.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { tr } from '../../core/i18n/tr.ts';
import { toast } from '../../ui/toast.ts';

const props = defineProps<{
  // The sessions to clear; null clears every one of them.
  targets: { id: string; name: string }[] | null;
  // How many sessions there are, to say what "all" means.
  total: number;
}>();
const emit = defineEmits<{ close: []; pruned: [result: PruneResult] }>();

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
const body = () => ({ ...(props.targets ? { sessions: props.targets.map(item => item.id) } : {}), before: before.value });

// What the current range would clear, measured again whenever the range changes.
const preview = ref<PruneResult>();
const measuring = ref(false);
const failed = ref('');
let asked = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function measure() {
  const own = ++asked;
  if (before.value === undefined) { preview.value = undefined; measuring.value = false; return; }
  measuring.value = true;
  failed.value = '';
  try {
    const result = await api.storagePrune({ ...body(), dry_run: true });
    if (own === asked) preview.value = result;
  } catch (error) {
    if (own === asked) { preview.value = undefined; failed.value = errorText(error); }
  } finally {
    if (own === asked) measuring.value = false;
  }
}
watch([range, date], () => { clearTimeout(timer); measuring.value = true; timer = setTimeout(measure, 250); }, { immediate: false });
void measure();
onBeforeUnmount(() => { clearTimeout(timer); asked++; });

const empty = computed(() => preview.value != null && preview.value.bytes.total === 0 && !preview.value.files);
const skipped = computed(() => preview.value?.skipped.length ?? 0);
const details = computed(() => {
  const found = preview.value;
  if (!found) return '';
  return [
    found.messages ? tr(`${found.messages} 条消息`, `${found.messages} message${found.messages === 1 ? '' : 's'}`) : '',
    found.events ? tr(`${found.events} 条运行记录`, `${found.events} run event${found.events === 1 ? '' : 's'}`) : '',
    found.files ? tr(`${found.files} 个文件`, `${found.files} file${found.files === 1 ? '' : 's'}`) : '',
  ].filter(Boolean).join(' · ');
});

const pruning = ref(false);
async function prune() {
  pruning.value = true;
  failed.value = '';
  try {
    const result = await api.storagePrune(body());
    const freed = Math.max(0, (result.database?.before ?? 0) - (result.database?.after ?? 0)) + result.bytes.files;
    const skipped = result.skipped.length;
    toast(tr(`已清理，释放了 ${fmtBytes(freed)}${skipped ? `；${skipped} 个运行中的会话已跳过` : ''}`,
      `Cleared, ${fmtBytes(freed)} freed${skipped ? `; ${skipped} running session${skipped === 1 ? '' : 's'} skipped` : ''}`));
    emit('pruned', result);
  } catch (error) {
    failed.value = errorText(error);
  } finally {
    pruning.value = false;
  }
}
</script>

<template>
  <Modal compact :open="true" :dismissable="!pruning" :title="tr('清理历史', 'Clear history')" @close="emit('close')">
    <div class="prune">
      <p class="prune-scope">{{ scope }}</p>
      <p class="prune-what">{{ tr('清理当前上下文已经不再使用的消息和运行记录，以及只被它们引用的附件、图片和命令输出。上下文里的内容都会保留，对话可以照常继续。', 'Clears the messages and run events the current context no longer uses, with the attachments, images and command output only they refer to. Everything in the context stays, so conversations carry on as before.') }}</p>

      <fieldset class="prune-range">
        <legend>{{ tr('清理多久以前的', 'Clear what is older than') }}</legend>
        <div class="prune-choices" role="radiogroup">
          <button v-for="item in ranges" :key="item.value" type="button" role="radio" :aria-checked="range === item.value" :disabled="pruning" @click="range = item.value">{{ item.label }}</button>
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
            <span>{{ tr('预计释放', 'About to free') }}</span>
            <strong>{{ fmtBytes(preview.bytes.total) }}</strong>
            <small v-if="details">{{ details }}</small>
          </template>
        </template>
        <span v-else-if="measuring || before !== undefined" class="prune-measuring"><Icon name="loader-circle" class="spin" />{{ tr('正在计算…', 'Measuring…') }}</span>
        <template v-else>{{ tr('选择一个日期。', 'Pick a date.') }}</template>
      </div>
      <p v-if="skipped && !measuring" class="prune-note">{{ tr(`${skipped} 个会话正在运行，这次会跳过。`, `${skipped} running session${skipped === 1 ? ' is' : 's are'} skipped.`) }}</p>
      <p v-if="failed" class="prune-error" role="alert">{{ failed }}</p>
      <p class="prune-note">{{ tr('清理后无法恢复：这些历史不再出现在对话记录和历史搜索里。', 'This cannot be undone: the cleared history no longer shows in the conversation or in history search.') }}</p>
    </div>
    <template #footer>
      <button class="btn ghost" :disabled="pruning" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn danger solid" :disabled="pruning || measuring || !preview || empty" @click="prune"><Icon v-if="pruning" name="loader-circle" class="spin" />{{ tr('清理', 'Clear') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.prune { display: grid; gap: 14px; }
.prune p { margin: 0; }
.prune-scope { color: var(--fg); font-weight: 500; }
.prune-what { color: var(--fg-muted); font-size: 13px; line-height: 1.6; }
.prune-range { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
.prune-range legend { margin-bottom: 8px; padding: 0; color: var(--fg-muted); font-size: 12.5px; }
.prune-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.prune-choices button { padding: 6px 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: transparent; color: var(--fg-muted); font: inherit; font-size: 13px; cursor: pointer; transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast); }
@media (hover: hover) { .prune-choices button:hover:not(:disabled) { color: var(--fg); border-color: var(--fg-subtle); } }
.prune-choices button[aria-checked='true'] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.prune-choices button:disabled { cursor: default; opacity: .6; }
.prune-date { display: flex; align-items: center; gap: 10px; color: var(--fg-muted); font-size: 13px; }
.prune-date .input { width: auto; min-width: 0; }
.prune-estimate { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-height: 64px; padding: 14px 16px; border-radius: 12px; background: var(--bg-sunken); color: var(--fg-muted); font-size: 13px; align-content: center; }
.prune-estimate strong { color: var(--fg); font-size: 22px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.prune-estimate small { flex-basis: 100%; color: var(--fg-subtle); font-size: 12.5px; }
.prune-measuring { display: inline-flex; align-items: center; gap: 8px; }
.prune-measuring .icon { width: 16px; height: 16px; }
.prune-note { color: var(--fg-subtle); font-size: 12.5px; line-height: 1.55; }
.prune-error { color: var(--danger); font-size: 12.5px; }
</style>
