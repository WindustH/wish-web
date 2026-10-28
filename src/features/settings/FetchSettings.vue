<script setup lang="ts">
import { serviceOrder } from './serviceOrder.ts';
import { computed, inject, ref } from 'vue';
import { ReorderGroup, ReorderItem, useDragControls } from 'motion-v';
import { post } from '../../core/api/client.ts';
import Modal from '../../ui/components/Modal.vue';
import PickerDialog from '../../ui/domain/providers/PickerDialog.vue';
import ProviderIcon from '../../ui/domain/providers/ProviderIcon.vue';
import Icon from '../../ui/components/Icon.vue';
import SettingsItemCard from './SettingsItemCard.vue';
import AccountPicker from './AccountPicker.vue';
import SwitchRow from '../../ui/domain/settings/SwitchRow.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { configDraftKey } from './useConfigDraft.ts';
import { fetchAccountPresets } from './accountCompatibility.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
const props = defineProps<{ save: () => Promise<boolean> }>();
const { draft, fetchCatalog: catalog } = inject(configDraftKey)!;
const mobile = useIsMobile();
const config = computed(() => (draft.value.fetch ??= { order: [], providers: {} }));
const order = computed<string[]>({
  get: () => serviceOrder(config.value.order, config.value.providers),
  set: (ids) => {
    config.value.order = ids;
  },
});
let suppressOpenUntil = 0;
const open = (id: string) => {
  if (Date.now() > suppressOpenUntil) editing.value = id;
};
const controls = new Map<string, ReturnType<typeof useDragControls>>();
const controlsOf = (id: string) => controls.get(id) ?? controls.set(id, useDragControls()).get(id)!;
const editing = ref(''),
  adding = ref(false),
  checking = ref('');
const current = computed(() => config.value.providers[editing.value]);
const brand = (id: string) =>
  (
    ({ deepseek_fetch: 'DeepSeek', zai_reader: 'Z.AI', jina_reader: 'Jina', codex_fetch: 'OpenAI' }) as Record<
      string,
      string
    >
  )[id];
const name = (id: string) =>
  id === 'codex_fetch' ? 'ChatGPT / Codex' : catalog.value.find((p) => p.id === id)?.name || id;
const spec = (id: string) => catalog.value.find((p) => p.id === id);
const allowedAccounts = fetchAccountPresets;
const choices = computed(() =>
  catalog.value.map((p) => ({
    key: p.id,
    title: name(p.id),
    brand: brand(p.id),
    icon: 'web-reader',
    description:
      p.id === 'codex_fetch'
        ? tr('使用 ChatGPT 账户读取网页', 'Read webpages with a ChatGPT account')
        : p.key === 'optional'
          ? tr('无需密钥，也可关联账户', 'Works without a key; an account is optional')
          : tr('关联已有账户，或添加新的 API Key', 'Link an existing account or add an API key'),
  })),
);
function add(preset: string) {
  const id = uniqueId(preset, (id) => id in config.value.providers);
  config.value.providers[id] = { preset, enabled: true, credential_id: null, proxy_enabled: true };
  config.value.order.push(id);
  adding.value = false;
  editing.value = id;
}
function move(id: string, delta: number) {
  const order = config.value.order;
  const i = order.indexOf(id),
    j = i + delta;
  if (i >= 0 && j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]];
}
function remove(id: string) {
  controls.delete(id);
  delete config.value.providers[id];
  config.value.order = config.value.order.filter((v: string) => v !== id);
  if (editing.value === id) editing.value = '';
}
async function check(id: string) {
  checking.value = id;
  try {
    if (!(await props.save())) return;
    await post(`/fetch/providers/${encodeURIComponent(id)}/check`, {});
    toast(tr('网页读取成功', 'Page fetched successfully'));
  } catch (error) {
    showError({ title: tr('网页读取失败', 'Fetch failed'), error });
  } finally {
    checking.value = '';
  }
}
</script>
<template>
  <section class="set-section">
    <header class="set-section-head">
      <h3>{{ tr('网页读取提供商', 'Webpage readers') }}</h3>
      <p>
        {{
          tr(
            '按顺序尝试读取服务，可以复用已有账户。拖动可以调整顺序。',
            'Readers are tried in order and can share existing accounts. Drag to reorder.',
          )
        }}
      </p>
    </header>
    <div class="fetch-list">
      <ReorderGroup v-if="order.length" v-model:values="order" as="div" axis="y" class="fetch-reorder">
        <ReorderItem
          v-for="(id, index) in order"
          :key="id"
          :value="id"
          as="div"
          :drag-listener="!mobile"
          :drag-controls="controlsOf(id)"
          @drag-start="suppressOpenUntil = Infinity"
          @drag-end="suppressOpenUntil = Date.now() + 250"
        >
          <SettingsItemCard
            draggable
            :title="name(config.providers[id].preset)"
            :summary="
              draft.accounts?.[config.providers[id].credential_id ?? '']?.name || tr('未关联账户', 'No linked account')
            "
            :position="Number(index) + 1"
            :state="{
              kind: config.providers[id].enabled ? 'ok' : 'disabled',
              text: config.providers[id].enabled ? tr('已启用', 'Enabled') : tr('已停用', 'Disabled'),
            }"
            :edit-hint="tr('编辑', 'Edit')"
            :remove-hint="tr('删除', 'Delete')"
            :check-hint="tr('测试读取', 'Test fetch')"
            :checking="checking === id"
            :busy="!!checking"
            @open="open(id)"
            @remove="remove(id)"
            @check="check(id)"
            @grab="controlsOf(id).start($event)"
            @move="move(id, $event)"
          >
            <template #mark><ProviderIcon :brand="brand(config.providers[id].preset)" fallback="globe" /></template>
          </SettingsItemCard>
        </ReorderItem>
      </ReorderGroup>
      <p v-if="!order.length" class="provider-list-empty">
        {{ tr('还没有网页读取提供商。', 'No webpage readers yet.') }}
      </p>
      <button type="button" class="provider-add" @click="adding = true">
        <span class="provider-add-icon"><Icon name="plus" /></span><span>{{ tr('添加提供商', 'Add provider') }}</span>
      </button>
    </div>
    <PickerDialog
      v-if="adding"
      :title="tr('添加网页读取提供商', 'Add webpage reader')"
      :items="choices"
      :placeholder="tr('搜索服务商…', 'Search services…')"
      @close="adding = false"
      @choose="add"
    />
    <Modal
      v-if="current"
      compact
      :open="true"
      :page="mobile"
      :content-class="mobile ? 'settings-editor mobile-settings-page' : 'settings-editor'"
      :title="name(current.preset)"
      @close="editing = ''"
    >
      <div class="fetch-form">
        <div class="set-card"><SwitchRow v-model="current.enabled" :name="tr('启用', 'Enabled')" /></div>
        <div class="set-card">
          <div class="set-row stacked">
            <span class="set-label">{{ tr('账户', 'Account') }}</span
            ><AccountPicker
              v-model="current.credential_id"
              :preset="allowedAccounts(current.preset)[0]"
              :allowed="allowedAccounts(current.preset)"
            />
          </div>
          <label class="set-row"
            ><span class="set-label"
              ><span>{{ tr('服务地址', 'Service URL') }}</span
              ><small>{{ tr('留空使用默认地址', 'Leave empty for the default address') }}</small></span
            ><input
              class="input"
              :value="current.base_url ?? ''"
              @input="current.base_url = ($event.target as HTMLInputElement).value.trim() || null"
              :placeholder="spec(current.preset)?.base_url"
          /></label>
          <SwitchRow v-model="current.proxy_enabled" :name="tr('使用代理', 'Use proxy')" />
        </div>
      </div>
      <template #footer
        ><button
          class="btn ghost icon-only settings-delete"
          :aria-label="tr('删除服务', 'Delete service')"
          @click="remove(editing)"
        >
          <Icon name="trash-2" /></button
        ><button class="btn" :disabled="!!checking" @click="check(editing)">
          <Icon :name="checking ? 'loader-circle' : 'refresh-cw'" :class="{ spin: !!checking }" />{{
            tr('测试读取', 'Test fetch')
          }}</button
        ><button class="btn primary" @click="editing = ''">{{ tr('完成', 'Done') }}</button></template
      >
    </Modal>
  </section>
</template>
<style scoped>
.fetch-list,
.fetch-reorder {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 12px;
}
.fetch-form {
  display: grid;
  gap: 16px;
}
@media (max-width: 899px) {
  .fetch-list,
  .fetch-reorder {
    gap: 10px;
  }
}
</style>
