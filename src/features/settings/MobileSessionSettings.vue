<script setup lang="ts">
import DefaultModelPicker from './DefaultModelPicker.vue';
import { computed, ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { type SelectOption } from '../../ui/components/SelectField.vue';
import { useSettingsReturn } from './settingsReturn';
import { tr, compactionFields } from './fields';
const props=defineProps<{config:any;providers:SelectOption[];efforts:SelectOption[];save:()=>Promise<boolean>;busy:boolean;error:string}>();
const page=ref('');
const titles=computed<Record<string,string>>(()=>({model:tr('默认模型','Default model'),instructions:tr('固定提示词','Instructions'),cwd:tr('工作目录','Working directory'),compaction:tr('上下文压缩','Context compaction')}));
const defaults=computed(()=>props.config.defaults);
const returns=useSettingsReturn(()=>!!page.value,async()=>{if(await returns.confirm())page.value='';});
</script>
<template>
  <div class="mobile-preferences">
    <p class="mobile-group-caption">{{tr('新会话','New sessions')}}</p>
    <div class="mobile-settings-list">
      <div class="mobile-settings-row default-model-row"><span>{{titles.model}}</span><DefaultModelPicker :config="config" :providers="providers" :efforts="efforts"/></div>
      <button class="mobile-settings-row" @click="page='instructions'"><span>{{titles.instructions}}<small class="row-preview">{{defaults.instructions||tr('未设置','Not set')}}</small></span><Icon name="chevron-right"/></button>
      <button class="mobile-settings-row" @click="page='cwd'"><span>{{titles.cwd}}<small class="row-preview">{{defaults.cwd||tr('未设置','Not set')}}</small></span><Icon name="chevron-right"/></button>
    </div>
    <p class="mobile-group-note">{{tr('保存后仅用于新建会话，不会更改已有会话的配置。','Saved defaults apply only to new sessions. Existing sessions keep their configuration.')}}</p>
    <div v-if="defaults.compaction" class="mobile-settings-list"><button class="mobile-settings-row" @click="page='compaction'"><span>{{titles.compaction}}</span><Icon name="chevron-right"/></button></div>
    <Modal page :before-close="returns.confirm" content-class="mobile-settings-page" :open="!!page" :title="titles[page]||''" @close="page=''">

      <p v-if="error" class="load-error" role="alert">{{error}}</p>
      <div v-if="page==='model'" class="mobile-settings-list mobile-fields">
        <div style="padding:14px"><DefaultModelPicker :config="config" :providers="providers" :efforts="efforts"/></div>
      </div>
      <template v-if="page==='instructions'"><p class="mobile-group-note">{{tr('每次新会话都会使用这段提示词。','These instructions are included in every new session.')}}</p><textarea class="input mobile-text-editor" :aria-label="titles.instructions" v-model="defaults.instructions"/></template>
      <template v-if="page==='cwd'"><div class="mobile-settings-list mobile-fields"><label>{{tr('绝对路径','Absolute path')}}<input class="input" v-model="defaults.cwd" autocomplete="off" autocapitalize="off" spellcheck="false"/></label></div><p class="mobile-group-note">{{tr('Shell 工具执行命令时使用的起始目录。','The starting directory for shell commands.')}}</p></template>
      <template v-if="page==='compaction'"><div class="mobile-settings-list mobile-fields"><label v-for="field in compactionFields()" :key="field.key">{{field.label}}<input class="input" type="number" inputmode="numeric" min="1" v-model.number="defaults.compaction[field.key]"/></label></div></template>
    </Modal>
  </div>
</template>

<style scoped>
.default-model-row { flex-direction:column; align-items:flex-start; gap:10px; }
</style>
