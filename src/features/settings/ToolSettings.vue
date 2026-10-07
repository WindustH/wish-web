<script setup lang="ts">
// The built-in tools new sessions start with, whether they may manage other sessions, and the shell
// they run commands in.
import ServerShellSettings from './ServerShellSettings.vue';
import SwitchRow from './SwitchRow.vue';
import ToolSwitchRows from './ToolSwitchRows.vue';
import type { ShellCatalog } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ config: any; shells: ShellCatalog | null; busy: boolean; searchAvailable: boolean | null }>();
</script>

<template>
  <fieldset :disabled="busy" class="settings-form">
    <section v-if="config.defaults.tools" class="set-section">
      <header class="set-section-head"><h3>{{ tr('默认启用', 'On by default') }}</h3><p>{{ tr('新会话默认启用的内置工具。每个会话也可以在会话设置里单独开关。', 'Built-in tools new sessions start with. Each session can switch them in its own settings.') }}</p></header>
      <div class="set-card">
        <ToolSwitchRows v-model="config.defaults.tools" :search-available="searchAvailable" in-settings />
      </div>
    </section>
    <section v-if="config.defaults.tools" class="set-section">
      <header class="set-section-head"><h3>{{ tr('会话与群组', 'Sessions and groups') }}</h3></header>
      <div class="set-card">
        <SwitchRow v-model="config.defaults.tools.sessions" :name="tr('新会话默认启用', 'On for new sessions')" :hint="config.defaults.tools.shell ? tr('模型可以用 wish session 查看、创建和联系其他会话；每个会话也可以单独开关', 'The model sees, makes and messages other sessions with wish session; each session can switch it') : tr('目前需要 Shell，而新会话默认不开启 Shell', 'Needs the shell for now, which new sessions start without')" />
      </div>
    </section>
    <section v-if="config.shell" class="set-section">
      <header class="set-section-head"><h3>Shell</h3><p>{{ tr('保存后，跟随全局设置的会话从下一条命令开始使用新的 Shell；单独设置了 Shell 的会话不受影响。', 'Saved changes apply to the next command of every session that follows this setting; sessions with their own shell keep it.') }}</p></header>
      <div class="set-card"><ServerShellSettings :value="config.shell" :catalog="shells" /></div>
    </section>
  </fieldset>
</template>
