<script setup lang="ts">
// Tools for checking the app rather than configuring it; nothing here is saved.
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import { Sparkles } from '@lucide/vue';
import { openOnboardingPreview } from '../onboarding/preview.ts';
import { cfg } from '../../core/config.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { tr } from './fields.ts';
import SettingHint from './SettingHint.vue';
import SettingsSections from './SettingsSections.vue';
import ConnectionDiagnostics from '../selftest/ConnectionDiagnostics.vue';

const sections = computed(() => [
  { id: 'diagnostics', label: tr('连接诊断', 'Connection diagnostics') },
  { id: 'onboarding', label: tr('首次使用引导', 'First-run setup') },
]);
const desktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
// This page renders with the settings route; the router knows where navigation ended.
const router = useRouter();
const closeSettings = inject<() => Promise<unknown>>('closeSettings');
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
        <div v-else-if="section === 'onboarding'" class="setting-row">
          <div><span>{{ tr('预览引导流程', 'Preview the setup') }}</span></div>
          <SettingHint :text="tr('显示还没有配置模型时看到的引导，不会保存任何配置。', 'Shows the setup seen before any model is configured. Nothing is saved.')" />
          <button id="debug-onboarding-preview" class="btn" @click="previewOnboarding"><Sparkles :size="16" />{{ tr('预览', 'Preview') }}</button>
        </div>
      </template>
    </SettingsSections>
  </div>
</template>
