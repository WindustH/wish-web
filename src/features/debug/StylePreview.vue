<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import AccountServicesPreview from './AccountServicesPreview.vue';
import RetryStatus from '../sessions/RetryStatus.vue';
import RunRetryPreview from './RunRetryPreview.vue';
import NotificationPreview from './NotificationPreview.vue';
import WorkStatusPreview from './WorkStatusPreview.vue';
import LoadingPreview from './LoadingPreview.vue';
import CodeHighlightPreview from './CodeHighlightPreview.vue';
import ComposerAttachmentPreview from './ComposerAttachmentPreview.vue';
import { tr } from '../../core/i18n/tr.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SelectField from '../../ui/components/SelectField.vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { stylePreviewFixtures } from './stylePreviewFixtures.ts';
import HistoryItem from '../sessions/HistoryItem.vue';
import FileChangeCards from '../sessions/entries/FileChangeCards.vue';
import ProcessGroup from '../sessions/entries/ProcessGroup.vue';
import ProcessDetailBody from '../sessions/entries/ProcessDetailBody.vue';
import PeerMessageCard from '../sessions/entries/PeerMessageCard.vue';
import ActivityDialogs from '../sessions/ActivityDialogs.vue';
import { openActivityKey, type ActivityRequest } from '../sessions/activityDialogs.ts';
const samples = stylePreviewFixtures();
const dialog = ref<InstanceType<typeof Modal>>();
const selectedId = ref('');
const narrow = ref(false);
const mobile = useIsMobile();
const deviceOverride = ref<'desktop' | 'mobile'>();
const device = computed(() => deviceOverride.value ?? (mobile.value ? 'mobile' : 'desktop'));
const deviceOptions = computed(() => [
  { value: 'desktop', label: tr('桌面', 'Desktop') },
  { value: 'mobile', label: tr('移动', 'Mobile') },
]);
function selectDevice(value: string) {
  if (value === 'desktop' || value === 'mobile') deviceOverride.value = value;
}
const groups = computed(() => [
  { id: 'interface', label: tr('界面状态', 'Interface states') },
  { id: 'composer', label: tr('输入框附件', 'Composer attachments') },
  { id: 'files', label: tr('文件卡片', 'Files') },
  { id: 'messages', label: tr('消息与错误', 'Messages and errors') },
  { id: 'tools', label: tr('工具执行', 'Tool execution') },
  { id: 'sessions', label: tr('会话间通信', 'Session communication') },
]);
const entries = computed(() => [
  { id: 'notifications', category: 'interface', title: tr('通知', 'Notifications') },
  { id: 'session-work', category: 'interface', title: tr('会话工作状态', 'Session work status') },
  { id: 'loading-states', category: 'interface', title: tr('加载状态', 'Loading states') },
  { id: 'code-highlighting', category: 'interface', title: tr('代码高亮', 'Code highlighting') },
  { id: 'account-services', category: 'interface', title: tr('账户服务弹窗', 'Account services dialog') },
  { id: 'composer-single', category: 'composer', title: tr('单张图片', 'Single image') },
  { id: 'composer-mixed', category: 'composer', title: tr('图片与文件', 'Images and files') },
  { id: 'composer-stack', category: 'composer', title: tr('多附件堆叠', 'Attachment stack') },
  ...samples.map((s) => ({ id: s.id, category: s.category, title: tr(s.zh, s.en) })),
]);
const selected = computed(() => entries.value.find((e) => e.id === selectedId.value));
const widthControl = computed(
  () => selected.value && !['notifications', 'account-services'].includes(selected.value.id),
);
const sample = computed(() => samples.find((s) => s.id === selectedId.value));
const chips = samples.filter((sample) => sample.kind === 'files').map((sample) => sample.item);
const request = ref<ActivityRequest | null>(null);
let requestId = 0;
provide(openActivityKey, (value) => {
  request.value = { ...value, requestId: ++requestId };
});
</script>
<template>
  <div class="style-preview">
    <section v-for="group in groups" :key="group.id" class="preview-group">
      <h3>{{ group.label }}</h3>
      <div class="preview-buttons">
        <button
          v-for="entry in entries.filter((e) => e.category === group.id)"
          :key="entry.id"
          type="button"
          class="btn"
          aria-haspopup="dialog"
          :data-preview-open="entry.id"
          @click="selectedId = entry.id"
        >
          {{ entry.title }}
        </button>
      </div>
    </section>
    <Modal
      :open="!!selected"
      :title="selected?.title ?? ''"
      ref="dialog"
      compact
      :content-class="
        ['style-sample-window', widthControl ? (narrow ? 'sample-narrow' : '') : 'sample-intrinsic'].join(' ')
      "
      @close="
        selectedId = '';
        request = null;
        deviceOverride = undefined;
      "
    >
      <template #compact-heading>
        <div class="dialog-topline">
          <h2 aria-hidden="true">{{ selected?.title }}</h2>
          <div class="dialog-toolbar">
            <SelectField
              v-if="selected?.id === 'notifications'"
              :model-value="device"
              :options="deviceOptions"
              :aria-label="tr('预览设备', 'Preview device')"
              segmented="always"
              @update:model-value="selectDevice"
            />
            <button
              v-if="widthControl"
              type="button"
              class="btn ghost sm preview-width"
              :aria-pressed="narrow"
              @click="narrow = !narrow"
            >
              {{ tr('窄栏', 'Narrow column') }}
            </button>
            <button
              type="button"
              class="btn ghost icon-only sample-close"
              :aria-label="tr('关闭', 'Close')"
              @click="dialog?.close()"
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
      </template>
      <div v-if="selected" class="preview-sample" :data-preview="selected.id">
        <NotificationPreview v-if="selected.id === 'notifications'" :placement="device" />
        <WorkStatusPreview v-else-if="selected.id === 'session-work'" />
        <LoadingPreview v-else-if="selected.id === 'loading-states'" />
        <CodeHighlightPreview v-else-if="selected.id === 'code-highlighting'" />
        <AccountServicesPreview v-else-if="selected.id === 'account-services'" />
        <ComposerAttachmentPreview
          v-else-if="selected.category === 'composer'"
          :count="selected.id === 'composer-stack' ? 7 : selected.id === 'composer-mixed' ? 3 : 1"
          :mixed="selected.id !== 'composer-single'"
        />
        <template v-else-if="sample">
          <FileChangeCards v-if="sample.kind === 'files'" :item="sample.item" />
          <div v-else-if="sample.kind === 'process'">
            <ProcessGroup :item="sample.item" />
            <details class="preview-tool-detail">
              <summary>{{ tr('展开调用与结果样式', 'Preview call and result details') }}</summary>
              <ProcessDetailBody :step="sample.item.steps[0]" :related-result="sample.item.steps[1]" />
            </details>
          </div>
          <PeerMessageCard v-else-if="sample.kind === 'peer'" v-bind="sample.item" preview />
          <RetryStatus v-else-if="sample.kind === 'retry'" :retries="sample.item" />
          <RunRetryPreview v-else-if="sample.kind === 'manual-retry'" v-bind="sample.item" />
          <HistoryItem v-else :item="sample.item" />
        </template>
      </div>
      <ActivityDialogs :chips="chips" :request="request" session="" @dismiss="request = null" />
    </Modal>
  </div>
</template>
<style scoped>
.style-preview {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.preview-group h3 {
  font: 500 13px/1.5 var(--font);
  margin: 0 0 8px;
  color: var(--fg-subtle);
}
.preview-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.preview-buttons .btn {
  max-width: 100%;
  height: auto;
  min-height: 34px;
  white-space: normal;
  text-align: start;
  overflow-wrap: anywhere;
}
:global(.modal-card.style-sample-window) {
  width: min(92vw, 36rem);
}
.preview-sample {
  min-width: 0;
}
:global(.modal-card.style-sample-window .modal-body) {
  padding: 12px 16px 16px;
}
:global(.modal-card.sample-intrinsic) {
  width: max-content;
  max-width: calc(100vw - 24px);
}
:global(.modal-card.sample-narrow) {
  width: min(92vw, 424px);
}
.preview-width[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}
.preview-tool-detail {
  margin-top: 10px;
  font-size: 13px;
}
.preview-tool-detail summary {
  cursor: pointer;
  color: var(--fg-muted);
}
</style>
