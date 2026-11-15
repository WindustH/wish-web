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
import FileDiff from './entries/FileDiff.vue';
import { changedFiles } from './fileChanges.ts';
import { tr } from '../../core/i18n/tr.ts';
import SystemEntry from './entries/SystemEntry.vue';
import PeerMessageDialog from './entries/PeerMessageDialog.vue';
import LateAnswerDialog from './entries/LateAnswerDialog.vue';
import BlobMentionCard from '../../domain/references/BlobMentionCard.vue';

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
      compact
      wide
      content-class="file-changes-dialog"
      :title="tr('文件修改', 'File changes')"
      @close="selected && closeActivity(selected.chipKey)"
    >
      <template #compact-heading
        ><div class="dialog-topline file-changes-heading">
          <Icon name="file-diff" />
          <h2>{{ tr('文件修改', 'File changes') }}</h2>
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
      <div class="file-change-details">
        <component
          :is="selectedFiles.length === 1 ? 'div' : 'details'"
          v-for="file in selectedFiles"
          :key="file.path"
          :open="selectedFiles.length === 1 || expandedFiles.has(file.path)"
          @toggle="
            ($event.target as HTMLDetailsElement).open ? expandedFiles.add(file.path) : expandedFiles.delete(file.path)
          "
        >
          <summary v-if="selectedFiles.length > 1">{{ file.path }}</summary>
          <template v-if="selectedFiles.length === 1 || expandedFiles.has(file.path)">
            <FileDiff
              v-for="(edit, index) in file.edits"
              :key="`${file.path}:${index}`"
              :edit="edit"
              :flat="selectedFiles.length === 1"
            />
          </template>
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
:global(.modal-card.file-changes-dialog:not(.modal-sheet)) {
  width: min(960px, calc(100vw - 32px));
}
.file-changes-heading > .icon {
  width: 16px;
  height: 16px;
  color: var(--fg-muted);
}
.file-changes-heading > h2 {
  font-size: 14px;
}
.file-change-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}
.file-change-details summary {
  padding: 8px 0;
  cursor: pointer;
  overflow-wrap: anywhere;
  font-family: var(--mono);
}
.activity-dialog-host {
  display: contents;
}
</style>
