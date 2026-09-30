<script setup lang="ts">
// The settings every new session starts from, on a desktop: its model, working directory and
// instructions, and how its context is compacted. A phone edits them in MobileSessionSettings.
import { inject } from 'vue';
import DefaultModelPicker from './DefaultModelPicker.vue';
import CompactionRows from './CompactionRows.vue';
import { configDraftKey } from './useConfigDraft.ts';
import { tr } from '../../core/i18n/tr.ts';

const { draft, busy, providerOptions, effortOptions } = inject(configDraftKey)!;
</script>

<template>
  <fieldset :disabled="busy" class="settings-form">
    <section class="set-section">
      <header class="set-section-head"><h3>{{tr('新会话','New sessions')}}</h3><p>{{tr('只用于之后新建的会话，已有会话保持原来的配置。','Applies to sessions created from now on. Existing sessions keep their configuration.')}}</p></header>
      <div class="set-card">
        <div class="set-row"><span class="set-label"><span>{{tr('默认模型','Default model')}}</span><small>{{tr('新会话使用的模型和思考强度','Model and reasoning effort for new sessions')}}</small></span><DefaultModelPicker class="set-end" :config="draft" :providers="providerOptions" :efforts="effortOptions"/></div>
        <label class="set-row"><span class="set-label"><span>{{tr('工作目录','Working directory')}}</span><small>{{tr('命令执行的起始目录，需要绝对路径','Where commands start. Use an absolute path.')}}</small></span><input class="input set-mono" v-model="draft.defaults.cwd" autocomplete="off" autocapitalize="off" spellcheck="false"/></label>
        <label class="set-row stacked"><span class="set-label"><span>{{tr('固定提示词','Instructions')}}</span><small>{{tr('每个新会话都会带上这段提示词','Included in every new session')}}</small></span><textarea class="input" rows="5" v-model="draft.defaults.instructions" :placeholder="tr('未设置','Not set')"/></label>
      </div>
    </section>
    <section v-if="draft.defaults.compaction" class="set-section">
      <header class="set-section-head"><h3>{{tr('上下文压缩','Context compaction')}}</h3><p>{{tr('对话接近上下文上限时，把较早的内容压缩成摘要。','Summarizes earlier turns as a conversation approaches its context limit.')}}</p></header>
      <div class="set-card">
        <CompactionRows :value="draft.defaults.compaction" show-compact />
      </div>
    </section>
  </fieldset>
</template>

