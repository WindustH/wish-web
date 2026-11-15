<script setup lang="ts">
// One stable host per session. Only requested or search-selected activities mount a dialog.
// Closing removes the host; moving a chip between virtual rows never changes its identity.
import { computed, ref, watch } from 'vue';
import type { EntryView } from '../../core/api/projections.ts';
import type { ChipItem } from '../../domain/chat/grouping.ts';
import type { ActivityRequest } from './activityDialogs.ts';
import QuestionDetailDialog from './entries/QuestionDetailDialog.vue';
import ProcessGroup from './entries/ProcessGroup.vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import FileDiff from './entries/FileDiff.vue';
import { changedFiles } from './fileChanges.ts';
import { tr } from '../../core/i18n/tr.ts';
import SystemEntry from './entries/SystemEntry.vue';
import PeerMessageDialog from './entries/PeerMessageDialog.vue';
import LateAnswerDialog from './entries/LateAnswerDialog.vue';
import BlobMentionCard from '../../domain/references/BlobMentionCard.vue';

const isMobile = useIsMobile();
const props = defineProps<{
  chips: ChipItem<EntryView>[];
  request: ActivityRequest | null;
  session: string;
  forcedKeys?: ReadonlySet<string>;
  locateSeq?: number;
}>();
const emit = defineEmits<{ dismiss: [requestId: number] }>();
const selected = ref<ActivityRequest | null>(null);
const expandedFiles = ref(new Set<string>());
const searchSelections = ref(new Set<string>());
watch(
  () => props.request,
  (request) => {
    selected.value = request;
    expandedFiles.value = new Set();
    searchSelections.value = new Set();
  },
  { immediate: true },
);
watch(
  () => [...(props.forcedKeys ?? [])],
  (keys) => {
    if (keys.length) {
      selected.value = null;
      searchSelections.value = new Set(keys);
    }
  },
  { immediate: true },
);
const activeChips = computed(() =>
  props.chips.filter((chip) => chip.key === selected.value?.chipKey || searchSelections.value.has(chip.key)),
);
function closeActivity(key: string) {
  if (selected.value?.chipKey === key) {
    emit('dismiss', selected.value.requestId);
    selected.value = null;
  }
  searchSelections.value = new Set([...searchSelections.value].filter((value) => value !== key));
}
// A disappearing activity cancels the open intent. Streaming reconciliation may restore it,
// but that is data arriving, not a new request to open a window.
watch(
  () => props.chips,
  (chips) => {
    if (
      selected.value &&
      !selected.value.question &&
      !selected.value.mentions &&
      !selected.value.peer &&
      !selected.value.lateAnswers &&
      !chips.some((chip) => chip.key === selected.value!.chipKey)
    )
      closeActivity(selected.value.chipKey);
  },
);
const selectedFiles = computed(() =>
  selected.value?.files
    ? activeChips.value
        .flatMap((chip) => changedFiles(chip))
        .filter((file) => !selected.value?.filePath || file.path === selected.value.filePath)
    : [],
);
const fileRoot = computed(() => {
  if (selectedFiles.value.length < 2) return '';
  const parents = selectedFiles.value.map((file) => file.path.replaceAll('\\', '/').split('/').slice(0, -1));
  // A common directory is a prefix, not matching segments after the first divergence.
  const end = parents[0]!.findIndex((part, index) => parents.some((parent) => parent[index] !== part));
  const root = `${parents[0]!.slice(0, end < 0 ? undefined : end).join('/')}/`;
  return root === '/' || /^[A-Za-z]:\/$/.test(root) ? '' : root;
});
const fileRows = computed(() =>
  selectedFiles.value.map((file) => {
    const path = file.path.replaceAll('\\', '/');
    const slash = path.lastIndexOf('/');
    return {
      ...file,
      name: path.slice(slash + 1),
      directory: slash >= 0 ? path.slice(fileRoot.value.length, slash) : '',
    };
  }),
);
const fileTotals = computed(() =>
  selectedFiles.value.reduce(
    (total, file) => ({ added: total.added + file.added, removed: total.removed + file.removed }),
    { added: 0, removed: 0 },
  ),
);
const requestedStep = computed(() => {
  const request = selected.value;
  return request?.stepKey ? { key: request.stepKey, tick: request.requestId, solo: request.solo } : undefined;
});
</script>

<template>
  <div class="activity-dialog-host">
    <PeerMessageDialog
      v-if="selected?.peer"
      :key="selected.requestId"
      v-bind="selected.peer"
      @close="selected && closeActivity(selected.chipKey)"
    />
    <LateAnswerDialog
      v-if="selected?.lateAnswers"
      :key="selected.requestId"
      :answers="selected.lateAnswers"
      @close="selected && closeActivity(selected.chipKey)"
    />
    <Modal
      v-if="selected?.mentions"
      :key="selected.requestId"
      :open="true"
      :sheet="isMobile"
      :title="tr(`引用文件 · ${selected.mentions.length}`, `Referenced files · ${selected.mentions.length}`)"
      @close="selected && closeActivity(selected.chipKey)"
    >
      <div class="blob-mention-list">
        <BlobMentionCard
          v-for="file in selected.mentions"
          :key="file.key"
          :mention="file.mention"
          @opened="selected && closeActivity(selected.chipKey)"
        />
      </div>
    </Modal>
    <QuestionDetailDialog
      v-if="selected?.question"
      :detail="selected.question"
      @close="selected && closeActivity(selected.chipKey)"
    />
    <Modal
      v-if="selected?.files"
      :open="true"
      :sheet="isMobile"
      compact
      wide
      content-class="file-changes-dialog"
      :title="tr('文件修改', 'File changes')"
      @close="selected && closeActivity(selected.chipKey)"
    >
      <template #compact-heading
        ><div class="dialog-topline file-changes-heading">
          <Icon name="file-diff" />
          <h2>
            {{ tr('文件修改', 'File changes') }}
            <span
              class="file-changes-count"
              :aria-label="tr(`${selectedFiles.length} 个文件`, `${selectedFiles.length} files`)"
            >
              {{ selectedFiles.length }}
            </span>
          </h2>
          <span v-if="fileTotals.added || fileTotals.removed" class="file-change-counts file-changes-totals">
            <span class="added">+{{ fileTotals.added }}</span>
            <span class="removed">−{{ fileTotals.removed }}</span>
          </span>
          <div class="dialog-toolbar">
            <button
              class="btn ghost icon-only"
              :aria-label="tr('关闭', 'Close')"
              @click="selected && closeActivity(selected.chipKey)"
            >
              <Icon name="x" />
            </button>
          </div></div
      ></template>
      <p v-if="fileRoot" class="file-changes-root" :title="fileRoot">
        <Icon name="folder" :size="14" /><span>{{ fileRoot.slice(0, -1) }}</span>
      </p>
      <div class="file-change-details" :class="{ 'file-change-list': selectedFiles.length > 1 }">
        <component
          :is="selectedFiles.length === 1 ? 'div' : 'details'"
          v-for="file in fileRows"
          :key="file.path"
          class="file-change-item"
          :open="selectedFiles.length === 1 || expandedFiles.has(file.path)"
          @toggle="
            ($event.target as HTMLDetailsElement).open ? expandedFiles.add(file.path) : expandedFiles.delete(file.path)
          "
        >
          <summary v-if="selectedFiles.length > 1" :title="file.path">
            <Icon name="file-diff" class="file-change-icon" />
            <span class="file-change-name">
              <strong>{{ file.name }}</strong>
              <small v-if="file.directory">{{ file.directory }}</small>
            </span>
            <span v-if="file.added || file.removed" class="file-change-counts">
              <span class="added">+{{ file.added }}</span>
              <span class="removed">−{{ file.removed }}</span>
            </span>
            <Icon name="chevron-right" class="file-change-chevron" />
          </summary>
          <div v-if="selectedFiles.length === 1 || expandedFiles.has(file.path)" class="file-change-edits">
            <FileDiff
              v-for="(edit, index) in file.edits"
              :key="`${file.path}:${index}`"
              :edit="edit"
              :show-counts="selectedFiles.length === 1 || file.edits.length > 1"
              flat
            />
          </div>
        </component>
      </div>
    </Modal>
    <template v-for="chip in activeChips" :key="chip.key">
      <ProcessGroup
        v-if="chip.type === 'process' && !selected?.files && !selected?.mentions"
        variant="ghost"
        :item="chip"
        :session="session"
        :forced="searchSelections.has(chip.key)"
        :open-step="selected?.chipKey === chip.key ? requestedStep : undefined"
        :open-tick="selected?.chipKey === chip.key && !selected.stepKey ? selected.requestId : undefined"
        :target-seq="locateSeq"
        @close="closeActivity(chip.key)"
      />
      <SystemEntry
        v-else-if="chip.type !== 'process'"
        variant="ghost"
        :item="chip"
        :forced="searchSelections.has(chip.key)"
        :open-tick="selected?.chipKey === chip.key ? selected.requestId : undefined"
        @close="closeActivity(chip.key)"
      />
    </template>
  </div>
</template>
<style scoped>
.blob-mention-list {
  display: grid;
  gap: 10px;
}
.blob-mention-list :deep(.blob-mention-card) {
  width: 100%;
}
:global(.file-changes-dialog.compact .modal-body) {
  padding: 12px 16px 16px;
}
:global(.modal-card.file-changes-dialog:not(.modal-page):not(.modal-sheet)) {
  width: min(960px, calc(100vw - 32px));
}
.file-changes-heading > .icon {
  width: 16px;
  height: 16px;
  color: var(--fg-muted);
}
.file-changes-heading > h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.file-changes-count {
  color: var(--fg-subtle);
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.file-changes-root {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0 0 10px;
  color: var(--fg-subtle);
  font: 11px/1.5 var(--mono);
}
.file-changes-root span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.file-change-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}
.file-change-list {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  overflow: clip;
}
.file-change-item {
  min-width: 0;
}
.file-change-item + .file-change-item {
  border-top: 1px solid var(--line);
}
.file-change-details summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  box-sizing: border-box;
  padding: 9px 12px;
  list-style: none;
  cursor: pointer;
}
.file-change-details summary::-webkit-details-marker {
  display: none;
}
.file-change-icon {
  width: 18px;
  height: 18px;
  color: var(--fg-subtle);
}
.file-change-name {
  flex: 1;
  min-width: 0;
}
.file-change-name strong,
.file-change-name small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.file-change-name strong {
  color: var(--fg);
  font: 500 13px/1.5 var(--font);
}
.file-change-name small {
  margin-top: 1px;
  color: var(--fg-subtle);
  font: 11px/1.5 var(--mono);
}
.file-change-counts {
  flex: none;
  display: flex;
  gap: 6px;
  white-space: nowrap;
  font: 500 11px/1.5 var(--mono);
  font-variant-numeric: tabular-nums;
}
.file-change-counts .added {
  color: var(--ok);
}
.file-change-counts .removed {
  color: var(--err);
}
.file-change-chevron {
  width: 14px;
  height: 14px;
  color: var(--fg-subtle);
}
.file-change-item[open] > summary .file-change-chevron {
  transform: rotate(90deg);
}
.file-change-list .file-change-edits {
  padding: 0 12px 12px;
  border-top: 1px solid var(--line);
}
.file-change-edits > :not(:first-child) {
  margin-top: 12px;
}
@media (hover: hover) {
  .file-change-details summary:hover {
    background: var(--bg-hover);
  }
}
.file-change-details summary:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.activity-dialog-host {
  display: contents;
}
</style>
