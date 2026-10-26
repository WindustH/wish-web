<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { activityEnabled, activityCount, setActivityEnabled } from '../../ui/diagnostics/activityStore.ts';
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
import SettingHint from './SettingHint.vue';
import SettingsSections from './SettingsSections.vue';
import ConnectionDiagnostics from '../selftest/ConnectionDiagnostics.vue';
import { closeOverlayKey } from '../../ui/composables/overlay.ts';
import { stalls } from '../../ui/scrollStalls.ts';

const ActivityLogPanel = defineAsyncComponent(() => import('./ActivityLogPanel.vue'));
const StylePreview = defineAsyncComponent(() => import('./StylePreview.vue'));
const ScrollStallsPanel = defineAsyncComponent(() => import('./ScrollStallsPanel.vue'));
const preview = ref<'styles' | 'scroll' | 'activity' | null>(null);
const previewTitle = computed(() => preview.value === 'activity' ? tr('用户行为日志', 'User activity log') : preview.value === 'styles' ? tr('样式预览', 'Style preview') : tr('滚动卡死记录', 'Scroll stalls'));
const sections = computed(() => [
  { id: 'activity', label: tr('调试模式', 'Debug mode') },
  { id: 'styles', label: tr('样式预览', 'Style preview') },
  { id: 'diagnostics', label: tr('连接诊断', 'Connection diagnostics') },
  { id: 'scroll', label: tr('滚动卡死记录', 'Scroll stalls') },
  { id: 'onboarding', label: tr('首次使用引导', 'First-run setup') },
  { id: 'icons', label: tr('图标', 'Icons') },
]);
// Every icon of Wish's own set, for looking them over together.
const iconNames = Object.keys(ICONS);
const desktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
// This page renders with the settings route; the router knows where navigation ended.
const router = useRouter();
const closeSettings = inject(closeOverlayKey);
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
  <div class="ui-settings debug-settings">
    <SettingsSections prefix="debug" :sections="sections">
      <template #default="{ section }">
        <template v-if="section === 'activity'">
          <div class="setting-row"><div><label for="activity-debug-enabled">{{ tr('记录用户行为日志', 'Record user activity') }}</label></div><SettingHint :text="tr('默认关闭，仅在本设备保存。记录操作、导航、请求状态、异常和弹层状态，便于排查卡死；不包含消息和附件内容。', 'Off by default. Stored on this device only. Records interactions, navigation, request status, errors and overlay state, excluding message and attachment contents.')" /><SwitchRoot id="activity-debug-enabled" class="cfg-switch" :model-value="activityEnabled" @update:model-value="setActivityEnabled"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <button class="btn" aria-haspopup="dialog" @click="preview = 'activity'"><Icon name="history-read" />{{ tr('查看与导出日志', 'View and export log') }}<span v-if="activityCount">{{ activityCount }}</span></button>
        </template>
        <template v-else-if="section === 'styles'">
          <button class="btn" aria-haspopup="dialog" @click="preview = 'styles'">{{ tr('打开样式预览', 'Open style preview') }}</button>
        </template>
        <ConnectionDiagnostics v-else-if="section === 'diagnostics'" />
        <template v-else-if="section === 'scroll'">
          <button class="btn" aria-haspopup="dialog" @click="preview = 'scroll'"><Icon name="history-read" />{{ tr('查看卡死记录', 'View stall records') }}<span v-if="stalls.length">{{ stalls.length }}</span></button>
        </template>
        <div v-else-if="section === 'onboarding'" class="setting-row">
          <div><span>{{ tr('预览引导流程', 'Preview the setup') }}</span></div>
          <SettingHint :text="tr('显示还没有配置模型时看到的引导，不会保存任何配置。', 'Shows the setup seen before any model is configured. Nothing is saved.')" />
          <button id="debug-onboarding-preview" class="btn" @click="previewOnboarding"><Icon name="sparkles" :size="16" />{{ tr('预览', 'Preview') }}</button>
        </div>
        <div v-else-if="section === 'icons'" class="icon-gallery">
          <figure v-for="name in iconNames" :key="name"><Icon :name="name" /><figcaption>{{ name }}</figcaption></figure>
        </div>
      </template>
    </SettingsSections>
    <Modal v-if="preview" :open="true" compact wide content-class="debug-detail-window" :title="previewTitle" @close="preview = null">
      <template #compact-heading><div class="dialog-topline"><h2>{{ previewTitle }}</h2><div class="dialog-toolbar"><button class="btn ghost icon-only" :aria-label="tr('关闭', 'Close')" @click="preview = null"><Icon name="x" /></button></div></div></template>
      <StylePreview v-if="preview === 'styles'" />
      <ActivityLogPanel v-else-if="preview === 'activity'" />
      <ScrollStallsPanel v-else />
    </Modal>
  </div>
</template>

<style scoped>
:global(.debug-detail-window.compact .modal-body) { padding: 14px 16px 16px; }
.icon-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 4px; padding: 8px 0; }
.icon-gallery figure { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 0; padding: 14px 4px 10px; border-radius: var(--radius); color: var(--fg); }
.icon-gallery .icon { width: 22px; height: 22px; }
.icon-gallery figcaption { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--fg-subtle); }
</style>
