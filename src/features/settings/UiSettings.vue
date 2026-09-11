<script setup lang="ts">
import { usePageActivity } from '../../ui/composables/usePageActivity';
const pageActive = usePageActivity();
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { SwitchRoot, SwitchThumb, DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { Download, Activity } from '@lucide/vue';
import { cfg } from '../../core/config.js';
import { theme } from '../../core/theme/index.js';
import { i18n } from '../../core/i18n/index.js';
import { prefs } from '../../core/state/prefsSlice.js';
import { platform } from '../../platform/index.js';
import { errorText } from '../../core/config-editor';
import { useMedia } from '../../ui/composables/useMedia';
import { tr } from './fields';
import SettingsSections from './SettingsSections.vue';
import SelectField from '../../ui/components/SelectField.vue';

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
const notice = ref('');
const problem = ref('');
const clearOpen = ref(false);
async function setNotifications(enabled: boolean) {
  problem.value = '';
  if (!enabled) { prefs.setNotifyOnFailure(false); return; }
  try {
    const notify = platform('notify');
    if (!notify.isSupported) { problem.value = tr('此浏览器不支持系统通知。', 'This browser does not support system notifications.'); return; }
    if (await notify.request() !== 'granted') { problem.value = tr('请先在浏览器中允许通知。', 'Allow notifications in your browser first.'); return; }
    prefs.setNotifyOnFailure(true);
  } catch (error) { problem.value = errorText(error); }
}
async function install() {
  problem.value = '';
  try {
    notice.value = await app.promptInstall()
      ? tr('安装请求已提交。', 'Installation requested.')
      : tr('可以从浏览器菜单选择“安装应用”或“添加到主屏幕”。', 'Choose Install app or Add to home screen from your browser menu.');
  } catch (error) { problem.value = errorText(error); }
}
function clearPreferences() {
  try {
    platform('storage').clear();
    clearOpen.value = false;
    notice.value = tr('已清除本地设置。下次打开页面时使用默认设置。', 'Local preferences cleared. Defaults will be used when you next open the page.');
  } catch (error) { problem.value = errorText(error); }
}
</script>

<template>
  <div class="ui-settings">
    <div class="cfg-heading"><p class="cfg-hint">{{ tr('修改后立即生效，只保存在当前浏览器。', 'Changes apply immediately and are saved in this browser only.') }}</p></div>
    <SettingsSections prefix="ui" :sections="sections">
      <template #before><p v-if="problem" class="cfg-notice cfg-error" role="alert">{{ problem }}</p><p v-if="notice" class="cfg-notice" role="status">{{ notice }}</p></template>
      <template #default="{ section }">
        <template v-if="section === 'appearance'">
          <div class="setting-row"><div><label for="ui-theme">{{ tr('主题', 'Theme') }}</label><p id="ui-theme-hint" class="cfg-hint">{{ tr('选择浅色、深色，或随操作系统自动切换。', 'Choose light, dark, or follow your operating system.') }}</p></div><SelectField id="ui-theme" aria-describedby="ui-theme-hint" :model-value="mode" :options="[{ value: 'auto', label: tr('跟随系统', 'Follow system') }, { value: 'light', label: tr('浅色', 'Light') }, { value: 'dark', label: tr('深色', 'Dark') }]" @update:model-value="theme.setMode" /></div>
          <div class="setting-row"><div><label for="ui-language">{{ tr('界面语言', 'Language') }}</label><p id="ui-language-hint" class="cfg-hint">{{ tr('只更改按钮和说明的语言，不翻译对话内容。', 'Changes interface labels and help; conversations are not translated.') }}</p></div><SelectField id="ui-language" aria-describedby="ui-language-hint" :model-value="locale" :options="[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]" @update:model-value="i18n.setLocale" /></div>
        </template>
        <template v-if="section === 'input'">
          <div v-if="desktop" class="setting-row"><div><label for="send-on-enter">{{ tr('按 Enter 发送消息', 'Send with Enter') }}</label><p id="send-on-enter-hint" class="cfg-hint">{{ sendOnEnter ? tr('按 Shift + Enter 换行。', 'Press Shift + Enter for a new line.') : tr('按 Enter 换行，按 Ctrl / ⌘ + Enter 发送。', 'Press Enter for a new line; Ctrl / ⌘ + Enter to send.') }}</p></div><SwitchRoot id="send-on-enter" aria-describedby="send-on-enter-hint" :model-value="sendOnEnter" class="cfg-switch" @update:model-value="prefs.setSendOnEnter"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <div v-else class="setting-row"><div><label for="keep-awake">{{ tr('运行时保持屏幕唤醒', 'Keep screen awake while running') }}</label><p id="keep-awake-hint" class="cfg-hint">{{ tr('仅在浏览器支持屏幕唤醒时生效。', 'Available when the browser supports screen wake lock.') }}</p></div><SwitchRoot id="keep-awake" aria-describedby="keep-awake-hint" :model-value="keepAwake" class="cfg-switch" @update:model-value="prefs.setKeepAwake"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <div class="setting-row"><div><label for="failure-notifications">{{ tr('运行失败时通知我', 'Notify me when a run fails') }}</label><p id="failure-notifications-hint" class="cfg-hint">{{ tr('页面在后台时显示系统通知。', 'Show system notifications while the page is in the background.') }}</p></div><SwitchRoot id="failure-notifications" aria-describedby="failure-notifications-hint" :model-value="notifyOnFailure" class="cfg-switch" @update:model-value="setNotifications"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        </template>
        <template v-if="section === 'local'">
          <div class="setting-row"><div><span>{{ tr('安装 Wish', 'Install Wish') }}</span><p class="cfg-hint">{{ app.isStandalone() ? tr('正在使用独立应用窗口。', 'Running in an application window.') : tr('从桌面或主屏幕直接打开 Wish。', 'Open Wish directly from your desktop or home screen.') }}</p></div><button id="ui-install" class="btn" @click="install"><Download :size="16" />{{ tr('安装', 'Install') }}</button></div>
          <div class="setting-row"><div><span>{{ tr('连接诊断', 'Connection diagnostics') }}</span><p class="cfg-hint">{{ tr('检查当前浏览器与后端的连接状态。', 'Check connectivity between this browser and the backend.') }}</p></div><RouterLink id="ui-diagnostics" class="btn" to="/selftest"><Activity :size="16" />{{ tr('检查连接', 'Check connection') }}</RouterLink></div>
          <div class="setting-row"><div><span>{{ tr('本地设置', 'Local preferences') }}</span><p class="cfg-hint">{{ tr('清除浏览器保存的偏好和输入草稿。后端会话不受影响。', 'Clear preferences and drafts stored in this browser. Server sessions remain available.') }}</p></div><button id="ui-clear-local" class="btn danger" @click="clearOpen = true">{{ tr('清除本地数据', 'Clear local data') }}</button></div>
        </template>
      </template>
      <template #after><p class="cfg-hint">Wish {{ cfg.meta.appVersion }}</p></template>
    </SettingsSections>
    <DialogRoot v-model:open="clearOpen"><DialogPortal v-if="pageActive"><DialogOverlay class="cfg-dialog-overlay" /><DialogContent class="cfg-dialog"><DialogTitle>{{ tr('清除本地数据？', 'Clear local data?') }}</DialogTitle><DialogDescription>{{ tr('将移除这个浏览器保存的界面偏好和消息草稿。', 'Remove interface preferences and message drafts saved in this browser.') }}</DialogDescription><div class="cfg-dialog-actions"><button class="btn ghost" @click="clearOpen = false">{{ tr('取消', 'Cancel') }}</button><button class="btn danger" @click="clearPreferences">{{ tr('确认清除', 'Clear local data') }}</button></div></DialogContent></DialogPortal></DialogRoot>
  </div>
</template>
