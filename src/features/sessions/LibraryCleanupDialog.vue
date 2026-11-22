<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bus } from '../../core/bus.ts';
import { cleanupLibrary } from '../../core/api/endpoints.ts';
import type { LibraryCleanup } from '../../core/api/types.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { toast } from '../../ui/toast.ts';

const props = defineProps<{ session: string; open: boolean }>();
const emit = defineEmits<{ close: []; cleaned: [] }>();
const missingLinks = ref(true),
  unusedHidden = ref(true);
const archive = ref(false);
const preview = ref<LibraryCleanup>();
const measuring = ref(false),
  cleaning = ref(false),
  error = ref('');
const revision = ref(0);
let controller: AbortController | undefined;
const count = computed(() => preview.value?.ids.length ?? 0);
const options = () => ({ missing_links: missingLinks.value, unused_hidden: unusedHidden.value });
watch(
  [() => props.open, () => props.session, missingLinks, unusedHidden, revision],
  async ([open, session], previous, cleanup) => {
    if (open && (!previous?.[0] || session !== previous[1])) archive.value = false;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    cleanup(() => request.abort());
    preview.value = undefined;
    error.value = '';
    cleaning.value = false;
    measuring.value = false;
    if (!open || (!missingLinks.value && !unusedHidden.value)) return;
    measuring.value = true;
    try {
      const result = await cleanupLibrary(props.session, { ...options(), dry_run: true }, { signal: request.signal });
      if (!request.signal.aborted) preview.value = result;
    } catch (cause) {
      if (!request.signal.aborted) error.value = describeError(cause).message;
    } finally {
      if (!request.signal.aborted) measuring.value = false;
    }
  },
  { immediate: true },
);

async function clean() {
  if (!preview.value || !count.value || measuring.value || cleaning.value) return;
  const request = controller;
  if (!request || request.signal.aborted) return;
  cleaning.value = true;
  error.value = '';
  try {
    const result = await cleanupLibrary(
      props.session,
      { ...options(), dry_run: false, ids: preview.value.ids, ...(archive.value ? { archive: true } : {}) },
      { signal: request.signal },
    );
    if (request.signal.aborted) return;
    if (result.unreadable_jobs) {
      preview.value = result;
      return;
    }
    const removed = result.missing_links + result.unused_hidden;
    const stale = result.stale_entries ?? 0;
    if (result.archive) bus.emit('archives.changed');
    const summary = tr(
      `已清理 ${removed} 个文件${stale ? `、${stale} 条失效记录` : ''}，释放 ${fmtBytes(result.bytes)}。`,
      `Removed ${removed} file${removed === 1 ? '' : 's'}${stale ? ` and ${stale} stale entr${stale === 1 ? 'y' : 'ies'}` : ''}, freed ${fmtBytes(result.bytes)}.`,
    );
    toast(
      result.archive
        ? summary + tr('归档包可在「存储 → 已归档」查看。', ' Find the ZIP in Storage → Archived.')
        : summary,
    );
    emit('cleaned');
    emit('close');
  } catch (cause) {
    if (!request.signal.aborted) error.value = describeError(cause).message;
  } finally {
    if (!request.signal.aborted) cleaning.value = false;
  }
}
</script>

<template>
  <Modal
    compact
    :open="open"
    :dismissable="!cleaning"
    :title="tr('清理文件库', 'Clean up Library')"
    @close="emit('close')"
  >
    <div class="library-cleanup">
      <p>
        {{
          tr(
            '检查此会话的所有文件夹。删除后无法恢复，链接的原文件不会被删除。',
            'Checks all folders in this session. Removal cannot be undone; linked original files are never deleted.',
          )
        }}
      </p>
      <label
        ><input v-model="missingLinks" type="checkbox" :disabled="cleaning" />
        {{ tr('清除无效链接（包括库中可见的失效项）', 'Remove broken links, including visible entries') }}</label
      >
      <label
        ><input v-model="unusedHidden" type="checkbox" :disabled="cleaning" />
        {{
          tr('清除当前上下文不再引用的隐藏文件', 'Remove hidden files no longer referenced by the current context')
        }}</label
      >
      <label
        ><input v-model="archive" type="checkbox" :disabled="cleaning" />{{
          tr('清理前归档文件', 'Archive files before cleanup')
        }}</label
      >
      <p class="library-cleanup-note">
        {{
          tr(
            '当前或备用上下文、待发送消息和未完成的生成任务使用的文件会保留。清理隐藏文件不会影响库中可见的文件。',
            'Files used by current or standby context, queued messages or unfinished generation jobs are kept. Hidden-file cleanup preserves visible Library files.',
          )
        }}
      </p>
      <div class="library-cleanup-preview" aria-live="polite">
        <span v-if="measuring"><Icon name="loader-circle" class="spin" />{{ tr('正在检查…', 'Checking…') }}</span>
        <template v-else-if="preview">
          <strong>{{
            count
              ? tr(`可清理 ${count} 项`, `${count} item${count === 1 ? '' : 's'} to remove`)
              : tr('没有可清理的文件', 'No files to remove')
          }}</strong>
          <span v-if="preview.stale_entries">{{
            tr(
              `${preview.stale_entries} 条失效记录（文件已不存在）`,
              `${preview.stale_entries} stale entr${preview.stale_entries === 1 ? 'y' : 'ies'} (files already missing)`,
            )
          }}</span>
          <span>{{
            tr(
              `无效链接 ${preview.missing_links} 个 · 隐藏文件 ${preview.unused_hidden} 个`,
              `${preview.missing_links} broken links · ${preview.unused_hidden} hidden files`,
            )
          }}</span>
          <span>{{ tr(`预计释放 ${fmtBytes(preview.bytes)}`, `Estimated space: ${fmtBytes(preview.bytes)}`) }}</span>
          <small v-if="preview.unreadable_jobs" role="status">{{
            tr(
              '有生成任务记录无法读取，暂时保留候选文件。修复记录后可重新检查。',
              'Some generation job records could not be read. Candidate files are kept until the records can be checked.',
            )
          }}</small>
          <small v-else-if="preview.protected">{{
            tr(
              `${preview.protected} 个候选文件仍在使用，已保留`,
              `${preview.protected} candidates are still in use and will be kept`,
            )
          }}</small>
        </template>
        <span v-else-if="!error">{{ tr('请选择清理项目', 'Choose what to clean up') }}</span>
      </div>
      <p v-if="error" class="library-cleanup-error" role="alert">{{ error }}</p>
      <button v-if="(error || preview?.unreadable_jobs) && !cleaning" type="button" class="btn sm" @click="revision++">
        {{ tr('重新检查', 'Check again') }}
      </button>
    </div>
    <template #footer>
      <button type="button" class="btn ghost" :disabled="cleaning" @click="emit('close')">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button
        type="button"
        class="btn library-confirm-cleanup"
        :class="archive ? 'primary' : 'danger solid'"
        :disabled="cleaning || measuring || !count || !!error"
        @click="clean"
      >
        <Icon v-if="cleaning" name="loader-circle" class="spin" /><Icon v-else-if="archive" name="archive" />
        {{ archive ? tr('归档并清理', 'Archive and clean up') : tr('清理', 'Clean up') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.library-cleanup {
  display: grid;
  gap: 14px;
}
.library-cleanup p {
  margin: 0;
  color: var(--fg-muted);
  line-height: 1.6;
}
.library-cleanup label {
  display: flex;
  gap: 10px;
  align-items: start;
}
.library-cleanup input {
  accent-color: var(--accent);
  margin-top: 4px;
}
.library-cleanup .library-cleanup-note {
  font-size: 13px;
}
.library-cleanup-preview {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-sunken);
}
.library-cleanup-preview > span:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}
.library-cleanup-preview small {
  color: var(--fg-subtle);
}
.library-cleanup .library-cleanup-error {
  color: var(--danger);
}
</style>
