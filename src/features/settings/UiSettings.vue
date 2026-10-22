<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { cfg } from '../../core/config.ts';
import { theme } from '../../core/theme/index.ts';
import { i18n } from '../../core/i18n/index.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { platform } from '../../platform/index.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import { hasNewWebBuild } from '../../ui/buildUpdate.ts';
import { needRefresh, prepareWebUpdate } from '../../ui/pwa.ts';
import { clearCached } from '../../core/util/responseCache.ts';
import { keepConnection } from '../../core/connection.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
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
const { choice: localeChoice } = i18n;
const { sendOnEnter, notifyOnFailure, keepAwake, textSize } = prefs;
// Shares of this device's standard text size; a phone's standard is a step larger than a desktop's.
const textSizes = computed(() => [
  { value: '0.9', label: tr('小', 'Small') },
  { value: '1', label: tr('标准', 'Standard') },
  { value: '1.1', label: tr('大', 'Large') },
  { value: '1.2', label: tr('特大', 'Larger') },
]);
const app = platform('app');
const clearOpen = ref(false);
const checkingUpdate = ref(false);
async function checkUpdate() {
  if (checkingUpdate.value) return;
  checkingUpdate.value = true;
  try {
    if (needRefresh.value) { toast(tr('新版本已就绪，请确认更新。', 'An update is ready; confirm to reload.')); return; }
    if (!await hasNewWebBuild(__WEB_BUILD_ID__)) {
      toast(tr('当前已是最新版本。', 'You are up to date.'));
      return;
    }
    const state = await prepareWebUpdate();
    if (state === 'waiting') toast(tr('发现新版本，正在准备更新。准备好后会提示你。', 'A new version is being prepared. You will be prompted when it is ready.'));
    // Other states open the shared update confirmation. Never reload mid-session.
  } catch (error) {
    showError({ title: tr('无法检查更新', 'Could not check for updates'), error });
  } finally { checkingUpdate.value = false; }
}

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
    const restoreConnection = keepConnection();
    platform('storage').clear();
    restoreConnection();
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
          <div class="setting-row"><div><label for="ui-text-size">{{ tr('字体大小', 'Text size') }}</label></div><SelectField mobile-page segmented id="ui-text-size" :model-value="String(textSize)" :options="textSizes" @update:model-value="value => prefs.setTextSize(Number(value))" /></div>
          <div class="setting-row"><div><label for="ui-language">{{ tr('界面语言', 'Language') }}</label></div><SelectField mobile-page id="ui-language" :model-value="localeChoice" :options="[{ value: 'auto', label: tr('跟随系统', 'Follow system') }, { value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]" @update:model-value="i18n.setChoice" /></div>
        </template>
        <template v-if="section === 'input'">
          <div v-if="desktop" class="setting-row"><div><label for="send-on-enter">{{ tr('按 Enter 发送消息', 'Send with Enter') }}</label></div><SettingHint id="send-on-enter-hint" :text="sendOnEnter ? tr('按 Shift + Enter 换行。', 'Press Shift + Enter for a new line.') : tr('按 Enter 换行，按 Ctrl / ⌘ + Enter 发送。', 'Press Enter for a new line; Ctrl / ⌘ + Enter to send.')" /><SwitchRoot id="send-on-enter" aria-describedby="send-on-enter-hint" :model-value="sendOnEnter" class="cfg-switch" @update:model-value="prefs.setSendOnEnter"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <div v-else class="setting-row"><div><label for="keep-awake">{{ tr('运行时保持屏幕唤醒', 'Keep screen awake while running') }}</label></div><SwitchRoot id="keep-awake" :model-value="keepAwake" class="cfg-switch" @update:model-value="prefs.setKeepAwake"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <div class="setting-row"><div><label for="failure-notifications">{{ tr('需要我处理时通知我', 'Notify me when I\'m needed') }}</label></div><SettingHint id="failure-notifications-hint" :text="tr('运行失败或模型向你提问时，如果页面在后台，显示系统通知。', 'Show a system notification when a run fails or the model asks you something while the page is in the background.')" /><SwitchRoot id="failure-notifications" aria-describedby="failure-notifications-hint" :model-value="notifyOnFailure" class="cfg-switch" @update:model-value="setNotifications"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        </template>
        <template v-if="section === 'local'">
          <div class="setting-row"><div><span>{{ tr('Web 更新', 'Web updates') }}</span></div><SettingHint :text="tr('向服务器检查当前 Web 界面是否有新版本。更新前会征求确认；局域网 HTTP 也能使用。', 'Check the server for a new Web build. You will be asked before reloading; also works over LAN HTTP.')" /><button id="ui-check-update" type="button" class="btn" :disabled="checkingUpdate" @click="checkUpdate">{{ checkingUpdate ? tr('正在检查…', 'Checking…') : tr('检查更新', 'Check for updates') }}</button></div>
          <div class="setting-row"><div><span>{{ tr('安装 Wish', 'Install Wish') }}</span></div><button id="ui-install" class="btn" @click="install"><Icon name="download" :size="16" />{{ tr('安装', 'Install') }}</button></div>
          <div class="setting-row"><div><span>{{ tr('本地设置', 'Local preferences') }}</span></div><SettingHint :text="tr('清除浏览器保存的偏好、输入草稿和缓存的模型列表与统计。后端会话不受影响。', 'Clear preferences, drafts and cached model lists and statistics stored in this browser. Server sessions remain available.')" /><button id="ui-clear-local" class="btn danger" @click="clearOpen = true">{{ tr('清除本地数据', 'Clear local data') }}</button></div>
        </template>
      </template>
    </SettingsSections>
    <Modal compact :open="clearOpen" :title="tr('清除本地数据？','Clear local data?')" @close="clearOpen=false"><p>{{tr('将移除这个浏览器保存的界面偏好、消息草稿，以及缓存的模型列表和统计数据。','Remove interface preferences, message drafts, and cached model lists and statistics saved in this browser.')}}</p><template #footer><button class="btn ghost" @click="clearOpen=false">{{tr('取消','Cancel')}}</button><button class="btn danger" @click="clearPreferences">{{tr('确认清除','Clear local data')}}</button></template></Modal>
  </div>
</template>
