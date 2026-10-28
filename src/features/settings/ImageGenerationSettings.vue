<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { configDraftKey } from './useConfigDraft.ts';
import AccountPicker from './AccountPicker.vue';
import SettingsItemCard from './SettingsItemCard.vue';
import PickerDialog from '../../ui/domain/providers/PickerDialog.vue';
import ProviderIcon from '../../ui/domain/providers/ProviderIcon.vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import SwitchRow from '../../ui/domain/settings/SwitchRow.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';
const { draft, imageCatalog } = inject(configDraftKey)!;
const mobile = useIsMobile();
const config = computed(() => (draft.value.image_generation ??= { order: [], providers: {} }));
const ids = computed(() => [
  ...config.value.order,
  ...Object.keys(config.value.providers).filter((id) => !config.value.order.includes(id)),
]);
const adding = ref(false),
  editing = ref('');
const current = computed(() => config.value.providers[editing.value]);
const spec = (id: string) => imageCatalog.value.find((p) => p.id === id);
const choices = computed(() =>
  imageCatalog.value.map((p) => ({
    key: p.id,
    title: p.name,
    brand: p.brand,
    description: p.model,
    search: `${p.id} ${p.protocol}`,
  })),
);
function add(id: string) {
  const preset = spec(id);
  if (!preset) return;
  const key = uniqueId(id, (key) => key in config.value.providers);
  config.value.providers[key] = {
    preset: id,
    credential_id: '',
    model: preset.model,
    enabled: true,
    proxy_enabled: true,
    parameters: {},
  };
  config.value.order.push(key);
  adding.value = false;
  editing.value = key;
}
function remove(id: string) {
  if (editing.value === id) editing.value = '';
  delete config.value.providers[id];
  config.value.order = config.value.order.filter((key) => key !== id);
}
function setPreferred(id: string) {
  config.value.order = [id, ...config.value.order.filter((key) => key !== id)];
}
function parameters(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  try {
    const value: unknown = JSON.parse(input.value);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(tr('参数必须为 JSON 对象', 'Parameters must be a JSON object'));
    current.value.parameters = value as Record<string, unknown>;
  } catch (error) {
    showError({ title: tr('生成参数无效', 'Invalid generation parameters'), error });
    input.value = JSON.stringify(current.value.parameters, null, 2);
  }
}
</script>
<template>
  <section class="set-section image-generation-settings">
    <p class="hint">
      {{
        tr(
          '默认使用第一个启用的服务。生成后保存到会话的 blob，并向模型返回本地路径。',
          'Uses the first enabled service by default. Generated images are stored as session blobs and local paths are returned to the model.',
        )
      }}
    </p>
    <div class="image-services">
      <SettingsItemCard
        v-for="(id, index) in ids"
        :key="id"
        :title="spec(config.providers[id].preset)?.name || id"
        :summary="`${config.providers[id].model} · ${draft.accounts[config.providers[id].credential_id]?.name || tr('未关联账户', 'No account')}`"
        :edit-hint="tr('编辑服务', 'Edit service')"
        :remove-hint="tr('删除服务', 'Delete service')"
        @open="editing = id"
        @remove="remove(id)"
      >
        <template #mark><ProviderIcon :brand="spec(config.providers[id].preset)?.brand" fallback="image" /></template>
        <template #actions
          ><button v-if="index" class="btn sm ghost" @click.stop="setPreferred(id)">
            {{ tr('设为首选', 'Use by default') }}
          </button></template
        >
      </SettingsItemCard>
      <button class="provider-add" @click="adding = true">
        <span class="provider-add-icon"><Icon name="plus" /></span>{{ tr('添加生图服务', 'Add image service') }}
      </button>
    </div>
    <p class="hint">
      {{
        tr(
          '在「工具」中启用 Image Generate。生图可能产生费用，提交中断时不会自动重试或切换服务。',
          'Enable Image Generate under Tools. Generation may incur charges; interrupted submissions are not automatically retried or routed to another service.',
        )
      }}
    </p>
    <PickerDialog
      v-if="adding"
      :title="tr('添加生图服务', 'Add image service')"
      :items="choices"
      :placeholder="tr('搜索生图服务…', 'Search image services…')"
      @close="adding = false"
      @choose="add"
    />
    <Modal
      v-if="current"
      :open="true"
      :page="mobile"
      content-class="settings-editor"
      :title="spec(current.preset)?.name || current.preset"
      @close="editing = ''"
    >
      <div class="image-editor">
        <div class="set-card">
          <SwitchRow v-model="current.enabled" :name="tr('启用', 'Enabled')" />
          <div class="set-row stacked">
            <span class="set-label">{{ tr('账户', 'Account') }}</span
            ><AccountPicker
              required
              v-model="current.credential_id"
              :allowed="spec(current.preset)?.account_presets"
              :preset="spec(current.preset)?.account_presets[0]"
            />
          </div>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('模型 ID', 'Model ID') }}</span
            ><input class="input" v-model="current.model"
          /></label>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('接口基础地址', 'Base URL') }}</span
            ><input class="input" v-model="current.base_url" :placeholder="spec(current.preset)?.base_url"
          /></label>
          <SwitchRow v-model="current.proxy_enabled" :name="tr('使用代理', 'Use proxy')" />
        </div>
        <div class="set-card">
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('生成参数（JSON）', 'Generation parameters (JSON)') }}</span
            ><small>{{
              tr(
                '按服务协议配置尺寸、质量、数量等；留 {} 使用预设。',
                'Configure size, quality and count according to the service protocol; use {} for preset defaults.',
              )
            }}</small
            ><textarea
              class="input parameters"
              :value="JSON.stringify(current.parameters, null, 2)"
              @change="parameters"
            />
          </label>
        </div>
        <p v-if="current.preset === 'codex_images'" class="hint">
          {{
            tr(
              '使用 ChatGPT 登录账户与订阅额度。此通道沿用 Codex 接口，是否可用取决于账户权限；不等同于 OpenAI API。',
              'Uses ChatGPT sign-in and subscription allowance through the Codex interface. Availability depends on account access; this is separate from the OpenAI API.',
            )
          }}
        </p>
        <a
          v-if="spec(current.preset)?.docs_url"
          :href="spec(current.preset)?.docs_url"
          target="_blank"
          rel="noreferrer"
          >{{ tr('服务文档', 'Service documentation') }}</a
        >
      </div>
      <template #footer>
        <button v-if="mobile && config.order[0] !== editing" class="btn ghost" @click="setPreferred(editing)">
          {{ tr('设为首选', 'Use by default') }}
        </button>
        <button v-if="mobile" class="btn danger ghost" @click="remove(editing)">
          {{ tr('删除服务', 'Delete service') }}
        </button>
        <button class="btn primary" @click="editing = ''">{{ tr('完成', 'Done') }}</button>
      </template>
    </Modal>
  </section>
</template>
<style scoped>
.image-services,
.image-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.hint {
  color: var(--fg-muted);
  font-size: 13px;
  line-height: 1.6;
}
.parameters {
  min-height: 140px;
  font-family: var(--font-mono);
  resize: vertical;
}
.image-editor small {
  color: var(--fg-muted);
}
</style>
