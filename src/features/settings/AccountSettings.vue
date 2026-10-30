<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import { accountRemovalPlan, removeAccountAndServices } from './accountRemoval.ts';
import AccountEditor from './AccountEditor.vue';
import PickerDialog from '../../domain/providers/PickerDialog.vue';
import { useAccountCatalog, type AccountPreset } from './useAccountCatalog.ts';
import SettingsItemCard from './SettingsItemCard.vue';
import ProviderIcon from '../../domain/providers/ProviderIcon.vue';
import Icon from '../../ui/components/Icon.vue';
import { configDraftKey } from './useConfigDraft.ts';
import { presetBrand } from '../../domain/providers/providerPresentation.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { tr } from '../../core/i18n/tr.ts';
const { draft, busy } = inject(configDraftKey)!;
const accountCatalog = useAccountCatalog();
const accountChoices = computed(() =>
  accountCatalog.value.map((p) => ({
    key: p.id,
    title: p.name,
    brand: p.brand,
    description: p.description,
    search: p.id,
  })),
);
const editing = ref(''),
  adding = ref(false);
function add(preset?: AccountPreset) {
  draft.value.accounts ??= {};
  const id = uniqueId(preset?.id || 'account', (id) => id in draft.value.accounts);
  draft.value.accounts[id] = {
    name: preset ? preset.name : tr('新账户', 'New account'),
    preset: preset?.id || 'custom',
    credentials: {},
    credentials_env: {},
    proxy_enabled: true,
  };
  adding.value = false;
  editing.value = id;
}
const accountUses = computed(() => {
  const links = new Map<string, string[]>();
  const groups = [
    ['providers', tr('模型', 'Model')],
    ['search', tr('搜索', 'Search')],
    ['fetch', tr('网页读取', 'Web fetch')],
    ['image_generation', tr('图片生成', 'Image generation')],
    ['video_generation', tr('视频生成', 'Video generation')],
    ['audio_generation', tr('音频生成', 'Audio generation')],
    ['audio_transcription', tr('语音转写', 'Transcription')],
  ] as const;
  for (const [group, label] of groups) {
    const services = group === 'providers' ? draft.value.providers : (draft.value[group]?.providers ?? {});
    for (const [id, service] of Object.entries(services)) {
      if (!service.credential_id) continue;
      const names = links.get(service.credential_id) ?? [];
      names.push(`${label} · ${'display_name' in service ? service.display_name || id : id}`);
      links.set(service.credential_id, names);
    }
  }
  return links;
});
const uses = (id: string) => accountUses.value.get(id) ?? [];
const removing = ref(''),
  removalStep = ref(1);
const removalPlan = computed(() => accountRemovalPlan(draft.value, removing.value));
const affected = computed(() => [
  ...removalPlan.value.mcp.map((id) => `MCP · ${id}`),
  ...removalPlan.value.media.map(({ id }) => `${tr('媒体服务', 'Media service')} · ${id}`),
  ...removalPlan.value.models.map((id) => `${tr('模型', 'Model')} · ${draft.value.providers[id].display_name || id}`),
  ...removalPlan.value.searches.map((id) => `${tr('搜索', 'Search')} · ${id}`),
  ...removalPlan.value.images.map((id) => `${tr('图片生成', 'Image generation')} · ${id}`),
  ...removalPlan.value.readers.map((id) => `${tr('网页读取', 'Web fetch')} · ${id}`),
]);
function remove(id: string) {
  removing.value = id;
  removalStep.value = 1;
}
function confirmRemoval() {
  if (busy?.value) return;
  if (removalStep.value === 1 && affected.value.length) {
    removalStep.value = 2;
    return;
  }
  removeAccountAndServices(draft.value, removing.value);
  if (editing.value === removing.value) editing.value = '';
  removing.value = '';
}
</script>
<template>
  <section class="set-section">
    <div class="account-list">
      <SettingsItemCard
        v-for="(account, id) in draft.accounts"
        :key="id"
        :title="account.name || String(id)"
        :summary="uses(String(id)).join('、') || tr('尚未关联服务', 'No linked services')"
        :edit-hint="tr('编辑账户', 'Edit account')"
        :remove-hint="tr('删除账户', 'Delete account')"
        :remove-warning="uses(String(id)).length > 0"
        @open="editing = String(id)"
        @remove="remove(String(id))"
      >
        <template #mark
          ><ProviderIcon
            :brand="accountCatalog.find((p) => p.id === account.preset)?.brand || presetBrand(account.preset || '')"
            fallback="key"
        /></template>
      </SettingsItemCard>
      <button type="button" class="provider-add" @click="adding = true">
        <span class="provider-add-icon"><Icon name="plus" /></span><span>{{ tr('添加账户', 'Add account') }}</span>
      </button>
    </div>
    <PickerDialog
      v-if="adding"
      :items="accountChoices"
      :title="tr('添加账户', 'Add account')"
      :placeholder="tr('搜索账户平台…', 'Search account platforms…')"
      @close="adding = false"
      @choose="add(accountCatalog.find((p) => p.id === $event))"
    >
      <template #footer-start
        ><button class="btn ghost" @click="add()">{{ tr('自定义账户', 'Custom account') }}</button></template
      >
    </PickerDialog>
    <AccountEditor
      v-if="editing"
      :id="editing"
      :allow-remove="true"
      :linked="uses(editing).length > 0"
      @remove="remove(editing)"
      @close="editing = ''"
    />
    <Modal
      compact
      :open="!!removing"
      :layer="110"
      :title="
        removalStep === 1
          ? tr('删除账户？', 'Delete account?')
          : tr('同时删除关联服务？', 'Delete linked services too?')
      "
      @close="removing = ''"
    >
      <p v-if="removalStep === 1">
        {{ tr('是否删除账户', 'Delete account') }}「{{ draft.accounts?.[removing]?.name || removing }}」？
      </p>
      <template v-else>
        <p>
          {{
            tr('删除此账户会同时删除以下服务配置：', 'Deleting this account also removes these service configurations:')
          }}
        </p>
        <ul class="account-removal-list">
          <li v-for="item in affected" :key="item">{{ item }}</li>
        </ul>
        <p v-if="removalPlan.resetsDefault">
          {{
            tr(
              '当前默认模型属于该账户，将一并清空，需要重新选择。',
              'The default model belongs to this account and will be cleared. Choose another default model afterward.',
            )
          }}
        </p>
      </template>
      <template #footer
        ><button class="btn ghost" @click="removing = ''">{{ tr('取消', 'Cancel') }}</button
        ><button class="btn danger" :disabled="busy" @click="confirmRemoval">
          {{ removalStep === 1 && affected.length ? tr('继续', 'Continue') : tr('确认删除', 'Confirm deletion') }}
        </button></template
      >
    </Modal>
  </section>
</template>
<style scoped>
.account-removal-list {
  max-height: 240px;
  overflow-y: auto;
  padding-left: 22px;
  overflow-wrap: anywhere;
}
.account-list {
  display: grid;
  gap: 12px;
}
@media (max-width: 899px) {
  .account-list {
    gap: 10px;
  }
}
</style>
