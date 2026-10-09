<script setup lang="ts">
// The model providers and the network proxy they use, edited in the settings draft.
import { inject, onUnmounted } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import AddProvider from './AddProvider.vue';
import PresetProvider from './PresetProvider.vue';
import ServerProxySettings from './ServerProxySettings.vue';
import { configDraftKey } from './useConfigDraft.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ save: () => Promise<boolean> }>();
const isMobile = useIsMobile();
const {
  draft, busy, catalog, proxyEnvironment, adding, newProviderId, advanced, advancedPending,
  providerTitle, protocolOptions, findPreset, load, applyAdvanced, addProvider, changeProtocol, removeProvider,
} = inject(configDraftKey)!;
// A provider is new only until this page is left; coming back must not reopen its editor.
onUnmounted(() => { newProviderId.value = ''; });
</script>

<template>
  <div class="provider-settings">
    <section class="set-section">
      <header class="set-section-head"><h3>{{tr('模型提供商','Model providers')}}</h3><p v-if="!isMobile">{{tr('选择预置服务商后填写密钥，也可以引用服务器环境变量。','Choose a preset, then enter credentials or reference server environment variables.')}}</p></header>
      <div class="provider-list">
        <PresetProvider v-for="(provider,id) in draft.providers" :key="id" :id="String(id)" :list-title="providerTitle(String(id))" :initially-open="id===newProviderId" :value="provider" :preset="findPreset(provider.preset)" :protocols="protocolOptions" :save="save" :saving="busy" @remove="removeProvider(String(id))" @protocol="changeProtocol(String(id),$event)" @login-complete="load">
          <details class="provider-json" @toggle="($event.target as HTMLDetailsElement).open&&!advancedPending[id]&&(advanced[id]=JSON.stringify(provider,null,2))"><summary><span>{{tr('完整配置 JSON','Full configuration JSON')}}</span><Icon name="chevron-down"/></summary><textarea class="input code" rows="16" v-model="advanced[id]" @input="advancedPending[id]=true"/><button v-if="!isMobile" class="btn" @click="applyAdvanced(String(id))">{{tr('应用到表单','Apply to form')}}</button></details>
        </PresetProvider>
        <button type="button" class="provider-add" :disabled="busy" @click="adding=true"><span class="provider-add-icon"><Icon name="plus"/></span><span>{{tr('添加提供商','Add provider')}}</span></button>
      </div>
    </section>
    <section v-if="draft.proxy" class="set-section">
      <header class="set-section-head"><h3>{{tr('网络代理','Network proxy')}}</h3><p>{{tr('提供商请求使用的代理，每个提供商可以在连接设置中单独关闭。','Used for provider requests. Each provider can opt out in its connection settings.')}}</p></header>
      <ServerProxySettings :value="draft.proxy" :environment="proxyEnvironment"/>
    </section>
  </div>
  <AddProvider v-if="adding" :catalog="catalog" @close="adding=false" @select="addProvider"/>
</template>

<style scoped>
@media (min-width: 900px) {
  .provider-list { display: grid; gap: 12px; }
}
@media (max-width: 899px) {
  .provider-list { border: 0; border-radius: 18px; background: var(--bg-sunken); overflow: hidden; }
  .provider-list > * + * { border-top: 2px solid transparent; }
}
</style>
