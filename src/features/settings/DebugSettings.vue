<script setup lang="ts">
import { ICONS } from '../../ui/icons.ts';
import Icon from '../../ui/components/Icon.vue';
// Tools for checking the app rather than configuring it; nothing here is saved.
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import { openOnboardingPreview } from '../onboarding/preview.ts';
import { cfg } from '../../core/config.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
import SettingHint from './SettingHint.vue';
import SettingsSections from './SettingsSections.vue';
import ConnectionDiagnostics from '../selftest/ConnectionDiagnostics.vue';
import { closeOverlayKey } from '../../ui/composables/overlay.ts';
import { stalls, clearStalls } from '../../ui/scrollStalls.ts';
import { copyText } from '../../ui/clipboard.ts';

const sections = computed(() => [
  { id: 'diagnostics', label: tr('连接诊断', 'Connection diagnostics') },
  { id: 'scroll', label: tr('滚动卡住记录', 'Scroll stalls') },
  { id: 'onboarding', label: tr('首次使用引导', 'First-run setup') },
  { id: 'icons', label: tr('图标', 'Icons') },
]);
// Every icon of Wish's own set, for looking them over together.
const iconNames = Object.keys(ICONS);
const desktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
// This page renders with the settings route; the router knows where navigation ended.
const router = useRouter();
const closeSettings = inject(closeOverlayKey);
const copyStalls = () => copyText(JSON.stringify(stalls.value, null, 2));
const summary = (stall: typeof stalls.value[number]) => [
  stall.coveredBy ? tr(`被 ${stall.coveredBy} 盖住`, `covered by ${stall.coveredBy}`) : stall.target,
  stall.moves, stall.click && tr(`点击：${stall.click}`, `click: ${stall.click}`), stall.layers.join(', '),
].filter(Boolean).join(' · ');
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
        <ConnectionDiagnostics v-if="section === 'diagnostics'" />
        <template v-else-if="section === 'scroll'">
          <div class="setting-row">
            <div><span>{{ tr('页面卡住时的状态', 'What the page was like when stuck') }}</span></div>
            <SettingHint :text="tr('一次明显的滑动或滚轮没能滚动下面的列表，或者点了按钮、链接却没有反应时，这里会记下当时的页面状态，只存在这台设备上。卡住之后来这里复制给开发者。', 'When a clear swipe or wheel turn fails to scroll the list under it, or a tap on a button or link does nothing, the page as it was is noted here, on this device only. Copy it for the developer after the page gets stuck.')" />
            <div class="stall-actions">
              <button class="btn" :disabled="!stalls.length" @click="copyStalls"><Icon name="copy" :size="16" />{{ tr('复制', 'Copy') }}</button>
              <button class="btn ghost" :disabled="!stalls.length" @click="clearStalls">{{ tr('清空', 'Clear') }}</button>
            </div>
          </div>
          <p v-if="!stalls.length" class="hint">{{ tr('还没有记录。', 'Nothing noted yet.') }}</p>
          <ol v-else class="stall-list">
            <li v-for="stall in stalls" :key="stall.at"><strong>{{ new Date(stall.at).toLocaleString() }} · {{ stall.kind }} · {{ stall.route }}</strong><code>{{ summary(stall) }}</code></li>
          </ol>
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
  </div>
</template>

<style scoped>
.stall-actions { display: flex; gap: 8px; }
.stall-list { display: grid; gap: 8px; margin: 8px 0 0; padding: 0; list-style: none; }
.stall-list li { display: grid; gap: 4px; padding: 10px 12px; border-radius: var(--radius); background: var(--bg-inset); font-size: 12.5px; }
.stall-list code { color: var(--fg-muted); font-size: 12px; overflow-wrap: anywhere; }
.icon-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 4px; padding: 8px 0; }
.icon-gallery figure { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 0; padding: 14px 4px 10px; border-radius: var(--radius); color: var(--fg); }
.icon-gallery .icon { width: 22px; height: 22px; }
.icon-gallery figcaption { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--fg-subtle); }
</style>
