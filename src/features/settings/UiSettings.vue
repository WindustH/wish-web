<script setup lang="ts">
import { ref } from 'vue';
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
    <p v-if="problem" class="cfg-notice cfg-error" role="alert">{{ problem }}</p><p v-if="notice" class="cfg-notice" role="status">{{ notice }}</p>
    <section class="card"><h2>{{ tr('外观与语言', 'Appearance and language') }}</h2>
      <div class="setting-row"><label for="ui-theme">{{ tr('主题', 'Theme') }}</label><select id="ui-theme" :value="mode" @change="theme.setMode(($event.target as HTMLSelectElement).value)"><option value="auto">{{ tr('跟随系统', 'Follow system') }}</option><option value="light">{{ tr('浅色', 'Light') }}</option><option value="dark">{{ tr('深色', 'Dark') }}</option></select></div>
      <div class="setting-row"><label for="ui-language">{{ tr('界面语言', 'Language') }}</label><select id="ui-language" :value="locale" @change="i18n.setLocale(($event.target as HTMLSelectElement).value)"><option value="zh">中文</option><option value="en">English</option></select></div>
    </section>
    <section class="card"><h2>{{ tr('输入与通知', 'Input and notifications') }}</h2>
      <div v-if="desktop" class="setting-row"><div><label for="send-on-enter">{{ tr('按 Enter 发送消息', 'Send with Enter') }}</label><p class="cfg-hint">{{ sendOnEnter ? tr('按 Shift + Enter 换行。', 'Press Shift + Enter for a new line.') : tr('按 Enter 换行，按 Ctrl / ⌘ + Enter 发送。', 'Press Enter for a new line; Ctrl / ⌘ + Enter to send.') }}</p></div><SwitchRoot id="send-on-enter" :model-value="sendOnEnter" class="cfg-switch" @update:model-value="prefs.setSendOnEnter"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
      <div v-else class="setting-row"><div><label for="keep-awake">{{ tr('运行时保持屏幕唤醒', 'Keep screen awake while running') }}</label><p class="cfg-hint">{{ tr('仅在浏览器支持屏幕唤醒时生效。', 'Available when the browser supports screen wake lock.') }}</p></div><SwitchRoot id="keep-awake" :model-value="keepAwake" class="cfg-switch" @update:model-value="prefs.setKeepAwake"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
      <div class="setting-row"><div><label for="failure-notifications">{{ tr('运行失败时通知我', 'Notify me when a run fails') }}</label><p class="cfg-hint">{{ tr('页面在后台时显示系统通知。', 'Show system notifications while the page is in the background.') }}</p></div><SwitchRoot id="failure-notifications" :model-value="notifyOnFailure" class="cfg-switch" @update:model-value="setNotifications"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
    </section>
    <section class="card"><h2>{{ tr('应用与本地数据', 'Application and local data') }}</h2>
      <div class="setting-row"><div><span>{{ tr('安装 Wish', 'Install Wish') }}</span><p class="cfg-hint">{{ app.isStandalone() ? tr('正在使用独立应用窗口。', 'Running in an application window.') : tr('从桌面或主屏幕直接打开 Wish。', 'Open Wish directly from your desktop or home screen.') }}</p></div><button class="btn" @click="install"><Download :size="16" />{{ tr('安装', 'Install') }}</button></div>
      <div class="setting-row"><span>{{ tr('连接诊断', 'Connection diagnostics') }}</span><RouterLink class="btn" to="/selftest"><Activity :size="16" />{{ tr('检查连接', 'Check connection') }}</RouterLink></div>
      <div class="setting-row"><div><span>{{ tr('本地设置', 'Local preferences') }}</span><p class="cfg-hint">{{ tr('清除浏览器保存的偏好和输入草稿。后端会话不受影响。', 'Clear preferences and drafts stored in this browser. Server sessions remain available.') }}</p></div><button class="btn danger" @click="clearOpen = true">{{ tr('清除本地数据', 'Clear local data') }}</button></div>
    </section>
    <p class="cfg-hint">Wish {{ cfg.meta.appVersion }}</p>
    <DialogRoot v-model:open="clearOpen"><DialogPortal><DialogOverlay class="cfg-dialog-overlay" /><DialogContent class="cfg-dialog"><DialogTitle>{{ tr('清除本地数据？', 'Clear local data?') }}</DialogTitle><DialogDescription>{{ tr('将移除这个浏览器保存的界面偏好和消息草稿。', 'Remove interface preferences and message drafts saved in this browser.') }}</DialogDescription><div class="cfg-dialog-actions"><button class="btn ghost" @click="clearOpen = false">{{ tr('取消', 'Cancel') }}</button><button class="btn danger" @click="clearPreferences">{{ tr('确认清除', 'Clear local data') }}</button></div></DialogContent></DialogPortal></DialogRoot>
  </div>
</template>
