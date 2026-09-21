<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import SelectField, { type SelectOption } from '../../ui/components/SelectField.vue';
import { useSettingsReturn } from './settingsReturn';
import { tr, compactionFields } from './fields';
const props=defineProps<{config:any;providers:SelectOption[];models:SelectOption[];efforts:SelectOption[];save:()=>Promise<boolean>;busy:boolean;error:string}>();
const page=ref('');
const titles=computed<Record<string,string>>(()=>({model:tr('默认模型','Default model'),instructions:tr('固定提示词','Instructions'),cwd:tr('工作目录','Working directory'),compaction:tr('上下文压缩','Context compaction'),server:tr('服务信息','Server information')}));
const defaults=computed(()=>props.config.defaults);
const modelName=computed(()=>props.models.find(m=>m.value===defaults.value.model)?.label||defaults.value.model||tr('未选择','Not selected'));
const returns=useSettingsReturn(()=>!!page.value,async()=>{if(await returns.confirm())page.value='';});
</script>
<template>
  <div class="mobile-preferences">
    <p class="mobile-group-caption">{{tr('新会话','New sessions')}}</p>
    <div class="mobile-settings-list">
      <button class="mobile-settings-row" @click="page='model'"><span>{{titles.model}}</span><small>{{modelName}}</small><Icon name="chevron-right"/></button>
      <button class="mobile-settings-row" @click="page='instructions'"><span>{{titles.instructions}}<small class="row-preview">{{defaults.instructions||tr('未设置','Not set')}}</small></span><Icon name="chevron-right"/></button>
      <button class="mobile-settings-row" @click="page='cwd'"><span>{{titles.cwd}}<small class="row-preview">{{defaults.cwd||tr('未设置','Not set')}}</small></span><Icon name="chevron-right"/></button>
    </div>
    <p class="mobile-group-note">{{tr('保存后仅用于新建会话，不会更改已有会话的配置。','Saved defaults apply only to new sessions. Existing sessions keep their configuration.')}}</p>
    <div v-if="defaults.compaction" class="mobile-settings-list"><button class="mobile-settings-row" @click="page='compaction'"><span>{{titles.compaction}}</span><Icon name="chevron-right"/></button></div>
    <div class="mobile-settings-list"><button class="mobile-settings-row" @click="page='server'"><span>{{titles.server}}</span><Icon name="chevron-right"/></button></div>
    <Modal page :before-close="returns.confirm" content-class="mobile-settings-page" :open="!!page" :title="titles[page]||''" @close="page=''">

      <p v-if="error" class="load-error" role="alert">{{error}}</p>
      <div v-if="page==='model'" class="mobile-settings-list mobile-fields">
        <label>{{tr('提供商','Provider')}}<SelectField mobile-page :picker-title="tr('提供商','Provider')" v-model="defaults.provider" :options="providers" searchable :search-placeholder="tr('搜索提供商','Search providers')"/></label>
        <label>{{tr('模型','Model')}}<SelectField v-if="models.length" mobile-page :picker-title="tr('模型','Model')" v-model="defaults.model" :options="models" searchable :search-placeholder="tr('搜索模型','Search models')"/><input v-else class="input" v-model="defaults.model"/></label>
        <label>{{tr('思考强度','Reasoning effort')}}<SelectField v-if="efforts.length" mobile-page :picker-title="tr('思考强度','Reasoning effort')" :model-value="defaults.reasoning?.effort??''" :options="[{value:'',label:tr('上游默认','Upstream default')},...efforts]" @update:model-value="defaults.reasoning={...defaults.reasoning,effort:$event||null}"/><input v-else class="input" :value="defaults.reasoning?.effort??''" @input="defaults.reasoning={...defaults.reasoning,effort:($event.target as HTMLInputElement).value||null}"/></label>
      </div>
      <template v-if="page==='instructions'"><p class="mobile-group-note">{{tr('每次新会话都会使用这段提示词。','These instructions are included in every new session.')}}</p><textarea class="input mobile-text-editor" :aria-label="titles.instructions" v-model="defaults.instructions"/></template>
      <template v-if="page==='cwd'"><div class="mobile-settings-list mobile-fields"><label>{{tr('绝对路径','Absolute path')}}<input class="input" v-model="defaults.cwd" autocomplete="off" autocapitalize="off" spellcheck="false"/></label></div><p class="mobile-group-note">{{tr('Shell 工具执行命令时使用的起始目录。','The starting directory for shell commands.')}}</p></template>
      <template v-if="page==='compaction'"><div class="mobile-settings-list mobile-fields"><label v-for="field in compactionFields()" :key="field.key">{{field.label}}<input class="input" type="number" inputmode="numeric" min="1" v-model.number="defaults.compaction[field.key]"/></label></div></template>
      <template v-if="page==='server'"><dl class="mobile-settings-list mobile-readonly"><div><dt>{{tr('监听地址','Listen address')}}</dt><dd>{{config.listen}}</dd></div><div><dt>{{tr('数据目录','Data directory')}}</dt><dd>{{config.data_dir}}</dd></div><div><dt>{{tr('访问令牌环境变量','Access token environment variable')}}</dt><dd>{{config.bearer_token_env||'—'}}</dd></div></dl><p class="mobile-group-note">{{tr('在服务器配置文件中修改，重启后生效。','Change these in the server configuration file and restart.')}}</p></template>
    </Modal>
  </div>
</template>
