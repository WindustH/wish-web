<script setup lang="ts">
// The built-in tools new sessions start with, whether they may manage other sessions, and the shell
// they run commands in.
import ServerShellSettings from '../../ui/domain/settings/ServerShellSettings.vue';
import ToolSwitchRows from '../../ui/domain/settings/ToolSwitchRows.vue';
import ToolBackgroundRow from '../../ui/domain/settings/ToolBackgroundRow.vue';
import ToolExecutionRow from '../../ui/domain/settings/ToolExecutionRow.vue';
import type { ShellCatalog } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ config: any; shells: ShellCatalog | null; busy: boolean; searchAvailable: boolean | null }>();
</script>

<template>
  <fieldset :disabled="busy" class="settings-form">
    <section v-if="config.defaults.tools" class="set-section">
      <header class="set-section-head">
        <h3>{{ tr('默认启用', 'On by default') }}</h3>
        <p>
          {{
            tr(
              '工具开关和提供方式仅作为新会话的默认值，不会改变已有会话；已有会话可单独配置。',
              'Tool switches and delivery modes are defaults for new sessions only. Existing sessions keep their own settings.',
            )
          }}
        </p>
      </header>
      <div class="set-card">
        <ToolExecutionRow
          :model-value="config.defaults.run?.tools ?? 'Parallel'"
          :disabled="busy"
          @update:model-value="config.defaults.run = { ...config.defaults.run, tools: $event }"
        />
        <ToolBackgroundRow
          :model-value="config.defaults.run?.background_tools_on_input ?? true"
          :disabled="busy"
          @update:model-value="config.defaults.run = { ...config.defaults.run, background_tools_on_input: $event }"
        />
        <ToolSwitchRows
          v-model="config.defaults.tools"
          :search-available="searchAvailable"
          :include="['shell', 'sessions', 'history_search', 'ask_user']"
          in-settings
        />
      </div>
    </section>
    <section v-if="config.shell" class="set-section">
      <header class="set-section-head">
        <h3>Shell</h3>
        <p>
          {{
            tr(
              '保存后，跟随全局设置的会话从下一条命令开始使用新的 Shell；单独设置了 Shell 的会话不受影响。',
              'Saved changes apply to the next command of every session that follows this setting; sessions with their own shell keep it.',
            )
          }}
        </p>
      </header>
      <div class="set-card"><ServerShellSettings :value="config.shell" :catalog="shells" /></div>
    </section>
  </fieldset>
</template>
