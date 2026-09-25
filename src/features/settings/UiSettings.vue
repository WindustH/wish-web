<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { Download, Activity, Sparkles } from '@lucide/vue';
import { openOnboardingPreview } from '../onboarding/preview';
import { cfg } from '../../core/config.js';
import { theme } from '../../core/theme/index.js';
import { i18n } from '../../core/i18n/index.js';
import { prefs } from '../../core/state/prefsSlice.js';
import { platform } from '../../platform/index.js';
import { showError } from '../../ui/errorDialog';
import { toast } from '../../ui/toast';
import { clearCached } from '../../core/util/responseCache';
import { useMedia } from '../../ui/composables/useMedia';
import { tr } from './fields';
import SettingHint from './SettingHint.vue';
import SettingsSections from './SettingsSections.vue';
import SelectField from '../../ui/components/SelectField.vue';
import Modal from '../../ui/components/Modal.vue';

const sections = computed(() => [
  { id: 'appearance', zh: '外观与语言', en: 'Appearance and language' },
  { id: 'input', zh: '输入与通知', en: 'Input and notifications' },
  { id: 'local', zh: '应用与本地数据', en: 'Application and local data' },
].map(item => ({ id: item.id, label: tr(item.zh, item.en) })));
const desktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
const { mode } = theme;
const { locale } = i18n;
const { sendOnEnter, notifyOnFailure, keepAwake } = prefs;
const app = platform('app');
const clearOpen = ref(false);
const notificationsFailed = (error: unknown) => showError({ title: tr('无法开启通知', 'Could not turn on notifications'), error });
async function setNotifications(enabled: boolean) {
  if (!enabled) { prefs.setNotifyOnFailure(false); return; }
  try {
    const notify = platform('notify');
    if (!notify.isSupported) { notificationsFailed(tr('此浏览器不支持系统通知。', 'This browser does not support system notifications.')); return; }
    if (await notify.request() !== 'granted') { notificationsFailed(tr('请先在浏览器中允许通知。', 'Allow notifications in your browser first.')); return; }
    prefs.setNotifyOnFailure(true);
  } catch (error) { notificationsFailed(error); }
}
async function install() {
  try {
    toast(await app.promptInstall()
      ? tr('安装请求已提交。', 'Installation requested.')
      : tr('可以从浏览器菜单选择“安装应用”或“添加到主屏幕”。', 'Choose Install app or Add to home screen from your browser menu.'));
  } catch (error) { showError({ title: tr('无法安装', 'Could not install'), error }); }
}
function clearPreferences() {
  try {
    platform('storage').clear();
    void clearCached();
    clearOpen.value = false;
    toast(tr('已清除本地设置。下次打开页面时使用默认设置。', 'Local preferences cleared. Defaults will be used when you next open the page.'));
  } catch (error) { showError({ title: tr('无法清除本地数据', 'Could not clear local data'), error }); }
}
</script>

<template>
  <div class="ui-settings">
    <SettingsSections prefix="ui" :sections="sections">
      <template #default="{ section }">
        <template v-if="section === 'appearance'">
          <div class="setting-row"><div><label for="ui-theme">{{ tr('主题', 'Theme') }}</label></div><SelectField mobile-page segmented id="ui-theme" :model-value="mode" :options="[{ value: 'auto', icon: 'monitor', label: tr('跟随系统', 'Follow system') }, { value: 'light', icon: 'sun', label: tr('浅色', 'Light') }, { value: 'dark', icon: 'moon', label: tr('深色', 'Dark') }]" @update:model-value="theme.setMode" /></div>
          <div class="setting-row"><div><label for="ui-language">{{ tr('界面语言', 'Language') }}</label></div><SelectField mobile-page id="ui-language" :model-value="locale" :options="[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]" @update:model-value="i18n.setLocale" /></div>
        </template>
        <template v-if="section === 'input'">
          <div v-if="desktop" class="setting-row"><div><label for="send-on-enter">{{ tr('按 Enter 发送消息', 'Send with Enter') }}</label></div><SettingHint id="send-on-enter-hint" :text="sendOnEnter ? tr('按 Shift + Enter 换行。', 'Press Shift + Enter for a new line.') : tr('按 Enter 换行，按 Ctrl / ⌘ + Enter 发送。', 'Press Enter for a new line; Ctrl / ⌘ + Enter to send.')" /><SwitchRoot id="send-on-enter" aria-describedby="send-on-enter-hint" :model-value="sendOnEnter" class="cfg-switch" @update:model-value="prefs.setSendOnEnter"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <div v-else class="setting-row"><div><label for="keep-awake">{{ tr('运行时保持屏幕唤醒', 'Keep screen awake while running') }}</label></div><SwitchRoot id="keep-awake" :model-value="keepAwake" class="cfg-switch" @update:model-value="prefs.setKeepAwake"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <div class="setting-row"><div><label for="failure-notifications">{{ tr('运行失败时通知我', 'Notify me when a run fails') }}</label></div><SettingHint id="failure-notifications-hint" :text="tr('页面在后台时显示系统通知。', 'Show system notifications while the page is in the background.')" /><SwitchRoot id="failure-notifications" aria-describedby="failure-notifications-hint" :model-value="notifyOnFailure" class="cfg-switch" @update:model-value="setNotifications"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        </template>
        <template v-if="section === 'local'">
          <div class="setting-row"><div><span>{{ tr('安装 Wish', 'Install Wish') }}</span></div><button id="ui-install" class="btn" @click="install"><Download :size="16" />{{ tr('安装', 'Install') }}</button></div>
          <div class="setting-row"><div><span>{{ tr('连接诊断', 'Connection diagnostics') }}</span></div><RouterLink id="ui-diagnostics" class="btn" to="/selftest"><Activity :size="16" />{{ tr('检查连接', 'Check connection') }}</RouterLink></div>
          <div class="setting-row"><div><span>{{ tr('首次使用引导', 'First-run setup') }}</span></div><SettingHint :text="tr('预览还没有配置模型时看到的引导流程，不会保存任何配置。', 'Preview the setup shown before any model is configured. Nothing is saved.')" /><button id="ui-onboarding-preview" class="btn" @click="openOnboardingPreview"><Sparkles :size="16" />{{ tr('预览', 'Preview') }}</button></div>
          <div class="setting-row"><div><span>{{ tr('本地设置', 'Local preferences') }}</span></div><SettingHint :text="tr('清除浏览器保存的偏好、输入草稿和缓存的模型列表与统计。后端会话不受影响。', 'Clear preferences, drafts and cached model lists and statistics stored in this browser. Server sessions remain available.')" /><button id="ui-clear-local" class="btn danger" @click="clearOpen = true">{{ tr('清除本地数据', 'Clear local data') }}</button></div>
        </template>
      </template>
    </SettingsSections>
    <Modal compact :open="clearOpen" :title="tr('清除本地数据？','Clear local data?')" @close="clearOpen=false"><p>{{tr('将移除这个浏览器保存的界面偏好、消息草稿，以及缓存的模型列表和统计数据。','Remove interface preferences, message drafts, and cached model lists and statistics saved in this browser.')}}</p><template #footer><button class="btn ghost" @click="clearOpen=false">{{tr('取消','Cancel')}}</button><button class="btn danger" @click="clearPreferences">{{tr('确认清除','Clear local data')}}</button></template></Modal>
  </div>
</template>
