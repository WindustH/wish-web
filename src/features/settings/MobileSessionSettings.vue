<script setup lang="ts">
import DefaultModelPicker from './DefaultModelPicker.vue';
import { computed, ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { type SelectOption } from '../../ui/components/SelectField.vue';
import { useSettingsReturn } from './settingsReturn.ts';
import { tr } from '../../core/i18n/tr.ts';
import CompactionRows from './CompactionRows.vue';
const props=defineProps<{config:any;providers:SelectOption[];efforts:SelectOption[]}>();
const page=ref('');
const titles=computed<Record<string,string>>(()=>({model:tr('默认模型','Default model'),instructions:tr('固定提示词','Instructions'),cwd:tr('工作目录','Working directory')}));
const defaults=computed(()=>props.config.defaults);
const instructionsPreview=computed(()=>defaults.value.instructions?.trim().split('\n')[0]||tr('未设置','Not set'));
const returns=useSettingsReturn(()=>!!page.value,async()=>{if(await returns.confirm())page.value='';});
</script>
<template>
  <div class="mobile-preferences">
    <p class="mobile-group-caption">{{tr('新会话','New sessions')}}</p>
    <div class="mobile-settings-list">
      <div class="mobile-settings-row default-model-row"><span>{{titles.model}}</span><DefaultModelPicker :config="config" :providers="providers" :efforts="efforts"/></div>
      <button class="mobile-settings-row" @click="page='cwd'"><span>{{titles.cwd}}</span><small class="mono">{{defaults.cwd||tr('未设置','Not set')}}</small><Icon name="chevron-right"/></button>
      <button class="mobile-settings-row" @click="page='instructions'"><span>{{titles.instructions}}</span><small>{{instructionsPreview}}</small><Icon name="chevron-right"/></button>
    </div>
    <p class="mobile-group-note">{{tr('只用于之后新建的会话，已有会话保持原来的配置。','Applies to sessions created from now on. Existing sessions keep their configuration.')}}</p>
    <template v-if="defaults.compaction">
      <p class="mobile-group-caption">{{tr('上下文压缩','Context compaction')}}</p>
      <div class="set-card mobile-card">
        <CompactionRows :value="defaults.compaction" inline />
      </div>
    </template>
    <Modal page :before-close="returns.confirm" content-class="mobile-settings-page" :open="!!page" :title="titles[page]||''" @close="page=''">
      <template v-if="page==='instructions'"><p class="mobile-page-note">{{tr('每次新会话都会使用这段提示词。','These instructions are included in every new session.')}}</p><textarea class="input mobile-text-editor" :aria-label="titles.instructions" :placeholder="tr('未设置','Not set')" v-model="defaults.instructions"/></template>
      <template v-if="page==='cwd'"><div class="set-card"><label class="set-row"><span class="set-label"><span>{{tr('绝对路径','Absolute path')}}</span><small>{{tr('Shell 执行命令时的起始目录','Where shell commands start')}}</small></span><input class="input set-mono" v-model="defaults.cwd" autocomplete="off" autocapitalize="off" spellcheck="false"/></label></div></template>
    </Modal>
  </div>
</template>

<style scoped>
.mobile-card { margin-bottom: 20px; }
.default-model-row { justify-content: space-between; }
.default-model-row :deep(.default-model-chip) { border-color: transparent; border-radius: 999px; background: var(--bg-sunken); }
.default-model-row :deep(.default-model-chip button) { min-height: 32px; padding-block: 4px; }
.mobile-page-note { margin: 0 14px 12px; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
</style>
