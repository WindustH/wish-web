<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { activityEnabled, activityCount, setActivityEnabled } from '../../domain/diagnostics/activityStore.ts';
import Modal from '../../ui/components/Modal.vue';
import { ICONS } from '../../ui/icons.ts';
import Icon from '../../ui/components/Icon.vue';
// Local diagnostic tools and previews.
import { computed, inject, defineAsyncComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { openOnboardingPreview } from '../onboarding/preview.ts';
import { cfg } from '../../core/config.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
import DebugToolRow from './DebugToolRow.vue';
import { closeOverlayKey } from '../../ui/composables/overlay.ts';
import { stalls } from '../../domain/diagnostics/scrollStalls.ts';

const ConnectionDiagnostics = defineAsyncComponent(() => import('../selftest/ConnectionDiagnostics.vue'));
const ActivityLogPanel = defineAsyncComponent(() => import('./ActivityLogPanel.vue'));
const StylePreview = defineAsyncComponent(() => import('./StylePreview.vue'));
const ScrollStallsPanel = defineAsyncComponent(() => import('./ScrollStallsPanel.vue'));
type DebugWindow = 'activity' | 'styles' | 'scroll' | 'diagnostics' | 'icons';
const preview = ref<DebugWindow | null>(null);
const windowTitles = computed(() => ({
  activity: tr('用户行为日志', 'User activity log'),
  styles: tr('样式预览', 'Style preview'),
  scroll: tr('卡死记录', 'Stall records'),
  diagnostics: tr('连接诊断', 'Connection diagnostics'),
  icons: tr('图标库', 'Icon library'),
}));
const previewTitle = computed(() => (preview.value ? windowTitles.value[preview.value] : ''));
// Every icon of Wish's own set, for looking them over together.
const iconNames = Object.keys(ICONS);
const desktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
// This page renders with the settings route; the router knows where navigation ended.
const router = useRouter();
const closeSettings = inject(closeOverlayKey, undefined);
async function previewOnboarding() {
  // The desktop settings dialog is modal and would take every click meant for
  // the preview, so leave it first (unless the user keeps editing).
  if (desktop.value && closeSettings) {
    await closeSettings();
    if (router.currentRoute.value.meta.section === 'settings') return;
  }
  openOnboardingPreview();
}
</script>

<template>
  <div class="debug-settings">
    <section class="debug-group" aria-labelledby="debug-records-heading">
      <h2 id="debug-records-heading">{{ tr('诊断与记录', 'Diagnostics & recording') }}</h2>
      <div class="debug-card">
        <div id="settings-debug-activity">
          <div class="debug-recording-row">
            <Icon name="diagnostics" class="debug-recording-icon" />
            <div class="debug-recording-copy">
              <label for="activity-debug-enabled">{{ tr('调试模式', 'Debug mode') }}</label>
              <p>
                {{
                  activityEnabled
                    ? tr('正在记录本标签页的操作', 'Recording activity in this tab')
                    : tr('开启后记录操作，帮助排查异常', 'Record activity to help investigate issues')
                }}
              </p>
            </div>
            <SwitchRoot
              id="activity-debug-enabled"
              class="cfg-switch"
              :model-value="activityEnabled"
              @update:model-value="setActivityEnabled"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
          <DebugToolRow
            class="debug-divided"
            icon="history-read"
            :title="tr('用户行为日志', 'Activity log')"
            :description="tr('查看操作记录，导出用于排查', 'Review and export recorded activity')"
            :count="activityCount"
            @open="preview = 'activity'"
          />
        </div>
        <div id="settings-debug-scroll" class="debug-divided">
          <DebugToolRow
            icon="triangle-alert"
            :title="tr('卡死记录', 'Stall records')"
            :description="tr('查看点击或滚动无响应时的页面状态', 'Page state when a tap or scroll did not respond')"
            :count="stalls.length"
            @open="preview = 'scroll'"
          />
        </div>
        <div id="settings-debug-diagnostics" class="debug-divided">
          <DebugToolRow
            icon="network"
            :title="tr('连接诊断', 'Connection diagnostics')"
            :description="tr('检查服务连接与浏览器环境', 'Check the service connection and browser environment')"
            @open="preview = 'diagnostics'"
          />
        </div>
      </div>
      <p class="debug-footnote">
        {{
          tr(
            '日志仅保存在本设备，不记录消息正文和附件内容。',
            'Logs stay on this device and exclude message and attachment contents.',
          )
        }}
      </p>
    </section>
    <section class="debug-group" aria-labelledby="debug-preview-heading">
      <h2 id="debug-preview-heading">{{ tr('界面预览', 'Interface previews') }}</h2>
      <div class="debug-card">
        <div id="settings-debug-styles">
          <DebugToolRow
            icon="appearance"
            :title="tr('样式预览', 'Style preview')"
            :description="tr('检查卡片、附件和详情窗口的显示效果', 'Explore cards, attachments and detail windows')"
            @open="preview = 'styles'"
          />
        </div>
        <div id="settings-debug-onboarding" class="debug-divided">
          <DebugToolRow
            id="debug-onboarding-preview"
            icon="sparkles"
            :title="tr('首次使用引导', 'First-run setup')"
            :description="tr('预览新用户的引导流程', 'Preview the new-user setup flow')"
            @open="previewOnboarding"
          />
        </div>
        <div id="settings-debug-icons" class="debug-divided">
          <DebugToolRow
            icon="shapes"
            :title="tr('图标库', 'Icon library')"
            :description="tr('浏览界面使用的全部图标', 'Browse all interface icons')"
            :count="iconNames.length"
            @open="preview = 'icons'"
          />
        </div>
      </div>
    </section>
    <Modal
      v-if="preview"
      :open="true"
      :page="!desktop"
      compact
      wide
      content-class="debug-detail-window"
      :title="previewTitle"
      @close="preview = null"
    >
      <template #compact-heading
        ><div class="dialog-topline">
          <h2>{{ previewTitle }}</h2>
          <div class="dialog-toolbar">
            <button class="btn ghost icon-only" :aria-label="tr('关闭', 'Close')" @click="preview = null">
              <Icon name="x" />
            </button>
          </div></div
      ></template>
      <StylePreview v-if="preview === 'styles'" />
      <ActivityLogPanel v-else-if="preview === 'activity'" />
      <ScrollStallsPanel v-else-if="preview === 'scroll'" />
      <ConnectionDiagnostics v-else-if="preview === 'diagnostics'" />
      <div v-else class="icon-gallery">
        <figure v-for="name in iconNames" :key="name">
          <Icon :name="name" />
          <figcaption>{{ name }}</figcaption>
        </figure>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.debug-settings {
  display: grid;
  gap: 28px;
  min-width: 0;
}
.debug-group {
  min-width: 0;
}
.debug-group > h2 {
  margin: 0 0 10px 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-subtle);
}
.debug-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-raised);
}
.debug-divided {
  border-top: 1px solid var(--line);
}
.debug-recording-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 17px 18px;
}
.debug-recording-icon {
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--fg-muted);
}
.debug-recording-copy {
  flex: 1;
  min-width: 0;
}
.debug-recording-copy label {
  font-size: 14px;
  font-weight: 500;
}
.debug-recording-copy p {
  margin: 4px 0 0;
  color: var(--fg-subtle);
  font-size: 12px;
  line-height: 1.5;
}
.debug-recording-row .cfg-switch {
  flex: none;
}
.debug-footnote {
  margin: 10px 4px 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--fg-subtle);
}
@media (max-width: 599px) {
  .debug-recording-row {
    padding: 15px 14px;
    gap: 10px;
  }
}

:global(.debug-detail-window.compact .modal-body) {
  padding: 14px 16px 16px;
}
.icon-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 4px;
  padding: 8px 0;
}
.icon-gallery figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 4px 10px;
  border-radius: var(--radius);
  color: var(--fg);
}
.icon-gallery .icon {
  width: 22px;
  height: 22px;
}
.icon-gallery figcaption {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--fg-subtle);
}
</style>
