<script setup lang="ts">
// The built-in tools new sessions start with, and the shell they run commands in.
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import ServerShellSettings from './ServerShellSettings.vue';
import type { ShellCatalog } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ config: any; shells: ShellCatalog | null; busy: boolean; searchAvailable: boolean | null }>();
</script>

<template>
  <fieldset :disabled="busy" class="settings-form">
    <section v-if="config.defaults.tools" class="set-section">
      <header class="set-section-head"><h3>{{ tr('默认启用', 'On by default') }}</h3><p>{{ tr('新会话默认启用的内置工具。每个会话也可以在会话设置里单独开关。', 'Built-in tools new sessions start with. Each session can switch them in its own settings.') }}</p></header>
      <div class="set-card">
        <div class="set-row inline toggle-row"><span class="set-label"><span>Shell</span><small>{{ tr('在工作目录中执行命令', 'Run commands in the working directory') }}</small></span><SwitchRoot v-model="config.defaults.tools.shell" class="cfg-switch" aria-label="Shell"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        <div class="set-row inline toggle-row"><span class="set-label"><span>Ask User</span><small>{{ tr('需要你决定时，给出选项或请你填写', 'Offer choices or ask you to fill in details when your call is needed') }}</small></span><SwitchRoot v-model="config.defaults.tools.ask_user" class="cfg-switch" aria-label="Ask User"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('MCP 服务器', 'MCP servers') }}</span><small>{{ config.defaults.tools.shell ? tr('允许在 Shell 里调用已配置的 MCP 服务器，切换不影响提示缓存', 'Let the shell reach the configured MCP servers. Switching keeps the prompt cache') : tr('需要先开启 Shell', 'Needs the shell on') }}</small></span><SwitchRoot v-model="config.defaults.tools.mcp" class="cfg-switch" :aria-label="tr('MCP 服务器', 'MCP servers')"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        <div class="set-row inline toggle-row"><span class="set-label"><span>Web Search</span><small>{{ searchAvailable === false ? tr('还没有能用的搜索提供商，先在「联网搜索」里添加', 'No search provider can answer yet; add one under Web search') : tr('在网上搜索资料，由「联网搜索」里的提供商完成', 'Search the web through the providers under Web search') }}</small></span><SwitchRoot v-model="config.defaults.tools.web_search" class="cfg-switch" aria-label="Web Search"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
      </div>
    </section>
    <section v-if="config.shell" class="set-section">
      <header class="set-section-head"><h3>Shell</h3><p>{{ tr('保存后，跟随全局设置的会话从下一条命令开始使用新的 Shell；单独设置了 Shell 的会话不受影响。', 'Saved changes apply to the next command of every session that follows this setting; sessions with their own shell keep it.') }}</p></header>
      <div class="set-card"><ServerShellSettings :value="config.shell" :catalog="shells" /></div>
    </section>
  </fieldset>
</template>
