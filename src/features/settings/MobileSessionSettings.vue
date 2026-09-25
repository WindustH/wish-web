<script setup lang="ts">
import DefaultModelPicker from './DefaultModelPicker.vue';
import { computed, ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { type SelectOption } from '../../ui/components/SelectField.vue';
import { useSettingsReturn } from './settingsReturn.ts';
import { tr, compactionFields } from './fields.ts';
import ServerShellSettings, { type ShellCatalog } from './ServerShellSettings.vue';
const props=defineProps<{config:any;shells:ShellCatalog|null;providers:SelectOption[];efforts:SelectOption[];save:()=>Promise<boolean>;busy:boolean}>();
const page=ref('');
const titles=computed<Record<string,string>>(()=>({model:tr('默认模型','Default model'),instructions:tr('固定提示词','Instructions'),cwd:tr('工作目录','Working directory'),shell:'Shell'}));
const shellName=computed(()=>{const program=props.config.shell?.program;return program?program.split(/[\\/]/).pop():tr('系统默认','System default');});
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
        <label v-for="field in compactionFields()" :key="field.key" class="set-row inline"><span class="set-label"><span>{{field.label}}</span><small>{{field.hint}}</small></span><span class="set-number"><input class="input" type="number" inputmode="numeric" min="1" v-model.number="defaults.compaction[field.key]"/></span></label>
      </div>
    </template>
    <template v-if="config.shell"><p class="mobile-group-caption">{{tr('命令执行','Command execution')}}</p>
    <div class="mobile-settings-list"><button class="mobile-settings-row" @click="page='shell'"><span>{{titles.shell}}</span><small>{{shellName}}</small><Icon name="chevron-right"/></button></div></template>
    <Modal page :before-close="returns.confirm" content-class="mobile-settings-page" :open="!!page" :title="titles[page]||''" @close="page=''">
      <template v-if="page==='instructions'"><p class="mobile-page-note">{{tr('每次新会话都会使用这段提示词。','These instructions are included in every new session.')}}</p><textarea class="input mobile-text-editor" :aria-label="titles.instructions" :placeholder="tr('未设置','Not set')" v-model="defaults.instructions"/></template>
      <template v-if="page==='cwd'"><div class="set-card"><label class="set-row"><span class="set-label"><span>{{tr('绝对路径','Absolute path')}}</span><small>{{tr('Shell 执行命令时的起始目录','Where shell commands start')}}</small></span><input class="input set-mono" v-model="defaults.cwd" autocomplete="off" autocapitalize="off" spellcheck="false"/></label></div></template>
      <template v-if="page==='shell'"><div class="set-card"><ServerShellSettings :value="config.shell" :catalog="shells"/></div><p class="mobile-page-note after">{{tr('保存后，跟随全局设置的会话从下一条命令开始使用新的 Shell；单独设置了 Shell 的会话不受影响。','Saved changes apply to the next command of every session that follows this setting; sessions with their own shell keep it.')}}</p></template>
    </Modal>
  </div>
</template>

<style scoped>
.mobile-card { margin-bottom: 20px; }
.default-model-row { justify-content: space-between; }
.default-model-row :deep(.default-model-chip) { border-color: transparent; border-radius: 999px; background: var(--bg-sunken); }
.default-model-row :deep(.default-model-chip button) { min-height: 32px; padding-block: 4px; }
.mobile-page-note { margin: 0 14px 12px; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
.mobile-page-note.after { margin: 10px 14px 0; }
</style>
