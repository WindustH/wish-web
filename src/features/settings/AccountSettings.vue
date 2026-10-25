<script setup lang="ts">
import { inject, ref } from 'vue';
import AccountEditor from './AccountEditor.vue';
import AddProvider from './AddProvider.vue';
import SettingsItemCard from './SettingsItemCard.vue';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import Icon from '../../ui/components/Icon.vue';
import { configDraftKey } from './useConfigDraft.ts';
import type { ProviderPreset } from '../../core/provider-presets.ts';
import { presetBrand, providerName } from '../../ui/providerPresentation.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { tr } from '../../core/i18n/tr.ts';
const { draft, catalog } = inject(configDraftKey)!;
const editing = ref(''), adding = ref(false);
function add(preset?: ProviderPreset) {
  draft.value.accounts ??= {};
  const id = uniqueId(preset?.id || 'account', id => id in draft.value.accounts);
  draft.value.accounts[id] = { name: preset ? providerName(preset.provider) : tr('新账户','New account'), preset: preset?.id || 'custom', credentials: {}, credentials_env: {}, proxy_enabled: true };
  adding.value = false; editing.value = id;
}
function uses(id: string) {
  return [['providers',tr('模型','Model')],['search',tr('搜索','Search')],['fetch',tr('网页读取','Web fetch')]].flatMap(([group,label]) =>
    Object.entries<any>(group === 'providers' ? draft.value.providers : draft.value[group!]?.providers ?? {}).filter(([,p]) => p.credential_id === id).map(([key,p]) => `${label} · ${p.display_name || key}`));
}
function remove(id: string) { if (!uses(id).length) { delete draft.value.accounts[id]; editing.value = ''; } }
</script>
<template>
  <section class="set-section">
    <div class="account-list">
      <SettingsItemCard v-for="(account,id) in draft.accounts" :key="id" :title="account.name || String(id)" :summary="uses(String(id)).join('、') || tr('尚未关联服务','No linked services')"
        :edit-hint="tr('编辑账户','Edit account')" :remove-hint="uses(String(id)).length ? tr('先解除服务关联后再删除','Unlink services before deleting') : tr('删除账户','Delete account')" :remove-disabled="uses(String(id)).length > 0"
        @open="editing=String(id)" @remove="remove(String(id))">
        <template #mark><ProviderIcon :brand="presetBrand(account.preset || '')" fallback="key" /></template>
      </SettingsItemCard>
      <button type="button" class="provider-add" @click="adding=true"><span class="provider-add-icon"><Icon name="plus" /></span><span>{{tr('添加账户','Add account')}}</span></button>
    </div>
    <AddProvider v-if="adding" :catalog="catalog" :title="tr('添加账户','Add account')" :custom-label="tr('自定义账户','Custom account')" @close="adding=false" @select="add" />
    <AccountEditor v-if="editing" :id="editing" :allow-remove="!uses(editing).length" @remove="remove(editing)" @close="editing=''" />
  </section>
</template>
<style scoped>
.account-list { display: grid; gap: 12px; }
@media (max-width: 899px) { .account-list { gap: 10px; } }
</style>
