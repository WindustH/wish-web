<script setup lang="ts">
import type { SettingsConfig } from '../../core/configTypes.ts';
// The built-in tools new sessions start with, whether they may manage other sessions, and the shell
// they run commands in.
import ServerShellSettings from '../../domain/settings/ServerShellSettings.vue';
import BuiltinToolSettings from '../../domain/settings/BuiltinToolSettings.vue';
import ToolBackgroundRow from '../../domain/settings/ToolBackgroundRow.vue';
import ToolExecutionRow from '../../domain/settings/ToolExecutionRow.vue';
import type { ShellCatalog } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ config: SettingsConfig; shells: ShellCatalog | null; busy: boolean }>();
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
        <BuiltinToolSettings v-model="config.defaults.tools" :disabled="busy" />
      </div>
    </section>
    <section class="set-section">
      <div class="set-card">
        <label class="set-row">
          <span class="set-label"
            ><span>{{ tr('服务器浏览器可执行文件', 'Server browser executable') }}</span></span
          >
          <input
            v-model="config.browser_executable"
            class="input"
            :placeholder="tr('自动检测 Chromium', 'Detect Chromium automatically')"
          />
        </label>
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
