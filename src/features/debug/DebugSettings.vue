<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { activityEnabled, activityCount, setActivityEnabled } from '../../domain/diagnostics/activityStore.ts';
import SettingsPage from '../../ui/components/SettingsPage.vue';
import Icon from '../../ui/components/Icon.vue';
// Local diagnostic tools and previews.
import { computed, defineAsyncComponent, ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import { cfg } from '../../core/config.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
import DebugToolRow from './DebugToolRow.vue';
import { stalls } from '../../domain/diagnostics/scrollStalls.ts';

defineProps<{ deviceOnly?: boolean }>();
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
const IconGallery = defineAsyncComponent(() => import('./IconGallery.vue'));
const desktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
const onboarding = ref(false);
const ProviderSetup = defineAsyncComponent(() => import('../onboarding/ProviderSetup.vue'));
const previewLinks = computed(
  () =>
    [
      { key: 'styles', icon: 'appearance', title: windowTitles.value.styles, action: tr('浏览样式', 'Browse styles') },
      {
        key: 'onboarding',
        icon: 'sparkles',
        title: tr('首次使用引导', 'First-run setup'),
        action: tr('预览引导', 'Preview setup'),
      },
      { key: 'icons', icon: 'shapes', title: windowTitles.value.icons, action: tr('浏览图标', 'Browse icons') },
    ] as const,
);
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
      <div class="debug-preview-links settings-link-list">
        <template v-for="link in previewLinks" :key="link.key">
          <div v-if="link.key !== 'onboarding' || !deviceOnly" :id="'settings-debug-' + link.key" class="set-card">
            <div class="set-row inline">
              <span class="settings-link-label"><Icon :name="link.icon" />{{ link.title }}</span>
              <button
                class="btn settings-page-link"
                type="button"
                :aria-haspopup="link.key === 'onboarding' ? 'dialog' : undefined"
                @click="link.key === 'onboarding' ? (onboarding = true) : (preview = link.key)"
              >
                {{ link.action }}<Icon name="arrow-up-right" :size="15" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </section>
    <Modal
      :open="onboarding"
      :title="tr('首次使用引导预览', 'First-run setup preview')"
      content-class="setup-preview-window"
      @close="onboarding = false"
    >
      <ProviderSetup preview @complete="onboarding = false" />
    </Modal>
    <SettingsPage
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
      <ConnectionDiagnostics v-else-if="preview === 'diagnostics'" :device-only="deviceOnly" />
      <IconGallery v-else />
    </SettingsPage>
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
</style>
