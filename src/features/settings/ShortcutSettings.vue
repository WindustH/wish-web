<script setup lang="ts">
import { computed } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { tr } from '../../core/i18n/tr.ts';

import { prefs } from '../../core/state/prefsSlice.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import { browserShortcutKeys, shortcutLabel, type BrowserShortcut } from '../../core/shortcuts.ts';
import { canCaptureTabKeys, capturingTabKeys, enterTabCapture } from '../../ui/tabShortcutCapture.ts';
import Icon from '../../ui/components/Icon.vue';
import { useRouter } from 'vue-router';
const router = useRouter();
defineProps<{ browserPage?: boolean }>();

const browserCommands = computed(() => [
  { id: 'find' as const, label: tr('浏览器查找', 'Browser find') },
  { id: 'caretBrowsing' as const, label: tr('光标浏览', 'Caret browsing') },
  { id: 'closeTab' as const, label: tr('关闭标签页', 'Close tab') },
  { id: 'newTab' as const, label: tr('新建标签页', 'New tab') },
  { id: 'print' as const, label: tr('打印', 'Print') },
  { id: 'save' as const, label: tr('保存网页', 'Save page') },
  { id: 'devTools' as const, label: tr('开发者工具', 'Developer tools') },
]);
const blocked = computed(() => shortcuts.value.value.blockedBrowser);
function browserLabel(id: BrowserShortcut) {
  if (id === 'closeTab' || id === 'newTab') return shortcutLabel({ key: browserShortcutKeys[id], ctrl: true });
  if (id === 'find') return 'Ctrl / ⌘ + F · F3 / Shift + F3 · Ctrl / ⌘ + G / Ctrl / ⌘ + Shift + G';
  if (id === 'caretBrowsing') return 'F7';
  if (id === 'devTools') return 'F12 · Ctrl + Shift + I / J / C · ⌘ + Alt + I / J / C';
  return `${shortcutLabel({ key: browserShortcutKeys[id], ctrl: true })} · ${shortcutLabel({ key: browserShortcutKeys[id], meta: true })}`;
}
</script>

<template>
  <div class="shortcut-settings" data-keyboard-boundary>
    <template v-if="!browserPage">
      <section class="set-section">
        <div class="set-card">
          <div class="set-row inline">
            <span class="settings-link-label"><Icon name="keyboard" />{{ tr('键位绑定', 'Key bindings') }}</span>
            <button class="btn settings-page-link" @click="router.push('/settings?section=shortcuts&advanced=keymap')">
              {{ tr('打开键位表', 'Open keymap') }}<Icon name="arrow-up-right" :size="15" />
            </button>
          </div>
        </div>
      </section>
      <section class="set-section">
        <header class="set-section-head">
          <h3>{{ tr('消息输入', 'Message input') }}</h3>
        </header>
        <div class="set-card">
          <div class="set-row inline toggle-row shortcut-row">
            <div class="set-label shortcut-name">
              <label for="send-on-enter">{{ tr('按 Enter 发送消息', 'Send with Enter') }}</label>
              <small>{{
                prefs.sendOnEnter.value
                  ? tr('Shift + Enter 换行', 'Shift + Enter for a new line')
                  : tr('Enter 换行，Ctrl / ⌘ + Enter 发送', 'Enter for a new line; Ctrl / ⌘ + Enter to send')
              }}</small>
            </div>
            <SwitchRoot
              id="send-on-enter"
              class="cfg-switch"
              :model-value="prefs.sendOnEnter.value"
              @update:model-value="prefs.setSendOnEnter"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
        </div>
      </section>
      <section class="set-section">
        <div class="set-card">
          <div class="set-row inline">
            <span class="settings-link-label"><Icon name="globe" />{{ tr('浏览器快捷键', 'Browser shortcuts') }}</span>
            <button class="btn settings-page-link" @click="router.push('/settings?section=shortcuts&advanced=browser')">
              {{ tr('查看快捷键', 'View shortcuts') }}<Icon name="arrow-up-right" :size="15" />
            </button>
          </div>
        </div>
      </section>
    </template>
    <section v-else class="set-section">
      <header class="set-section-head">
        <p>
          {{
            tr(
              '开启表示允许，关闭表示禁用。绑定了应用动作时，仍执行应用动作。',
              'On allows the browser action; off disables it. Any assigned app command still runs.',
            )
          }}
        </p>
      </header>
      <div class="set-card">
        <div v-for="command in browserCommands" :key="command.id" class="set-row inline toggle-row shortcut-row">
          <div class="set-label shortcut-name">
            <label :for="`browser-${command.id}`">{{ command.label }}</label
            ><small>{{ browserLabel(command.id) }}</small>
          </div>
          <SwitchRoot
            :id="`browser-${command.id}`"
            class="cfg-switch"
            :model-value="!blocked[command.id]"
            @update:model-value="shortcuts.setBrowserBlocked(command.id, !$event)"
            ><SwitchThumb class="cfg-switch-thumb"
          /></SwitchRoot>
        </div>
      </div>
      <div v-if="blocked.closeTab || blocked.newTab" class="tab-capture">
        <small>{{
          tr(
            '浏览器可能保留标签页快捷键。支持键盘锁定的浏览器可在全屏下拦截。',
            'Browsers may reserve tab shortcuts. Fullscreen capture is available in browsers that support keyboard lock.',
          )
        }}</small>
        <button
          v-if="canCaptureTabKeys()"
          type="button"
          class="btn sm"
          :disabled="capturingTabKeys"
          @click="enterTabCapture"
        >
          {{
            capturingTabKeys
              ? tr('全屏拦截已启用', 'Fullscreen capture active')
              : tr('全屏拦截', 'Capture in fullscreen')
          }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tab-capture {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 4px;
  color: var(--fg-subtle);
}
.tab-capture button {
  flex: none;
}
.shortcut-name small {
  overflow-wrap: anywhere;
}
</style>
