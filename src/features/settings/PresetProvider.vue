<script setup lang="ts">
import { useIsMobile } from '../../ui/composables/useMedia.ts';
const isMobile = useIsMobile();
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import type { ProviderConfig, ProviderPreset } from '../../core/provider-presets.ts';
import { presetProfile } from './preset-profile.ts';
import { presetDescription, providerName } from '../../ui/providerPresentation.ts';
import { protocolPresentation } from '../../ui/protocolPresentation.ts';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import AccountPicker from './AccountPicker.vue';
import SelectField from '../../ui/components/SelectField.vue';
import AnimatedDetails from '../../ui/components/AnimatedDetails.vue';
import Hint from '../../ui/components/Hint.vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useSettingsReturn } from './settingsReturn.ts';
import ProviderModels from './ProviderModels.vue';
import { ACCOUNT_PROTOCOLS } from '../../core/provider-presets.ts';
import SettingsItemCard, { type ItemState } from './SettingsItemCard.vue';
import KeyValueEditor from './KeyValueEditor.vue';
// `listTitle` names the provider in the phone list, where no ID is shown beside it.
const props = defineProps<{
  id: string;
  value: ProviderConfig;
  preset?: ProviderPreset;
  protocols: string[];
  initiallyOpen?: boolean;
  save?: () => Promise<boolean>;
  saving?: boolean;
  listTitle?: string;
}>();
const emit = defineEmits<{ remove: []; protocol: [value: string]; loginComplete: [] }>();
const editing = ref(props.initiallyOpen ?? false);
// On a desktop the models open in a window of their own, from the button beside "edit".
const modelsOpen = ref(false);
const mobilePanel = ref('');
const mobileReturning = ref(false);
const modelEditor = ref<InstanceType<typeof ProviderModels>>();
function openModelAdd() {
  modelEditor.value?.openAdd();
}
async function backToProvider() {
  if (await returns.confirm()) {
    mobileReturning.value = true;
    mobilePanel.value = '';
  }
}
const returns = useSettingsReturn(
  () => isMobile.value && editing.value,
  async () => {
    if (mobilePanel.value) await backToProvider();
    else if (await returns.confirm()) closeEditor();
  },
);
function closeEditor() {
  editing.value = false;
}
const displayName = computed(
  () => props.value.display_name || (props.preset ? providerName(props.preset.provider) : props.id),
);
const panels = computed(() => [
  { id: 'connection', label: tr('连接', 'Connection'), value: protocolPresentation(props.value.protocol).label },
  {
    id: 'auth',
    label: tr('身份验证', 'Authentication'),
    value:
      props.value.auth === 'none'
        ? tr('无需认证', 'None')
        : props.value.auth === 'sig_v4'
          ? 'AWS SigV4'
          : tr('凭据与认证方式', 'Credentials'),
  },
  { id: 'models', label: tr('模型', 'Models'), value: String(Object.keys(props.value.models).length) },
  { id: 'advanced', label: tr('高级设置', 'Advanced settings'), value: '' },
]);

const state = computed<ItemState>(() =>
  props.value.enabled
    ? { kind: 'ok', text: tr('已启用', 'Enabled') }
    : { kind: 'disabled', text: tr('已停用', 'Disabled') },
);
const profile = computed(() => (props.preset ? presetProfile(props.preset) : undefined));
const copilot = computed(() => props.preset?.id === 'github_copilot');
const options = (items: string[]) => items.map((value) => ({ value, ...protocolPresentation(value) }));
const optional = (items: string[]) => [{ value: '', label: tr('不使用', 'Disabled') }, ...options(items)];
</script>
<template>
  <SettingsItemCard
    class="provider-item"
    :title="isMobile ? listTitle || displayName : displayName"
    :summary="`${Object.keys(value.models).length} ${tr('个模型', 'models')}${preset ? ' · ' + presetDescription(preset) : ''}`"
    :state="state"
    :label="id"
    :edit-hint="tr('编辑提供商', 'Edit provider')"
    :remove-hint="tr('删除提供商', 'Delete provider')"
    @open="
      mobilePanel = '';
      editing = true;
    "
    @remove="emit('remove')"
  >
    <template #mark><ProviderIcon :brand="preset?.provider" /></template>
    <template #detail
      >{{ id }}<template v-if="preset"> · {{ presetDescription(preset) }}</template></template
    >
    <template v-if="!isMobile" #actions
      ><Hint :text="tr('模型', 'Models')"
        ><button
          type="button"
          class="btn ghost provider-models-button"
          :aria-label="`${tr('模型', 'Models')} ${displayName}`"
          @click="modelsOpen = true"
        >
          <Icon name="model" /><span>{{ Object.keys(value.models).length }}</span>
        </button></Hint
      ></template
    >
    <Modal
      v-if="!isMobile"
      :open="modelsOpen"
      :title="tr('模型 · ', 'Models · ') + displayName"
      wide
      @close="modelsOpen = false"
    >
      <template #actions
        ><Hint :text="tr('添加模型', 'Add model')"
          ><button
            type="button"
            class="btn ghost icon-only"
            :aria-label="tr('添加模型', 'Add model')"
            @click="openModelAdd"
          >
            <Icon name="plus" /></button></Hint
      ></template>
      <ProviderModels ref="modelEditor" :id="id" :value="value" :preset="preset" />
    </Modal>
    <Modal
      compact
      :before-close="isMobile ? returns.confirm : undefined"
      :content-class="isMobile ? 'settings-editor mobile-settings-page provider-panel' : 'settings-editor'"
      :back="isMobile && mobilePanel ? backToProvider : undefined"
      :page="isMobile"
      :open="editing"
      :title="
        isMobile
          ? panels.find((p) => p.id === mobilePanel)?.label || displayName
          : tr('编辑提供商 · ', 'Edit provider · ') + id
      "
      wide
      @close="closeEditor"
    >
      <div
        class="provider-form"
        :key="isMobile ? mobilePanel : 'desktop'"
        :class="{ 'mobile-fields': isMobile, returning: mobileReturning }"
      >
        <header v-if="isMobile && !mobilePanel" class="provider-hero">
          <span class="provider-mark"><ProviderIcon :brand="preset?.provider" /></span>
          <div>
            <strong>{{ displayName }}</strong
            ><small
              >{{ id }}<template v-if="preset"> · {{ presetDescription(preset) }}</template></small
            >
          </div>
        </header>
        <label v-show="!isMobile || !mobilePanel" class="provider-name"
          >{{ tr('显示名称', 'Display name')
          }}<input
            class="input"
            :value="value.display_name ?? ''"
            :placeholder="preset ? providerName(preset.provider) : id"
            @input="value.display_name = ($event.target as HTMLInputElement).value || null"
        /></label>
        <div v-if="!isMobile" class="provider-toggle">
          <span>{{ tr('启用此提供商', 'Enable provider') }}</span
          ><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用此提供商', 'Enable provider')"
            ><SwitchThumb class="cfg-switch-thumb"
          /></SwitchRoot>
        </div>
        <div v-else v-show="!mobilePanel" class="mobile-settings-list">
          <div class="mobile-settings-row">
            <span>{{ tr('启用此提供商', 'Enable provider') }}</span
            ><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用此提供商', 'Enable provider')"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
        </div>
        <nav v-if="isMobile && !mobilePanel" class="mobile-settings-list">
          <button
            v-for="panel in panels"
            :key="panel.id"
            class="mobile-settings-row"
            @click="
              mobileReturning = false;
              mobilePanel = panel.id;
            "
          >
            <span>{{ panel.label }}</span
            ><small>{{ panel.value }}</small
            ><Icon name="chevron-right" />
          </button>
        </nav>
        <button
          v-if="isMobile && !mobilePanel"
          class="btn danger solid mobile-provider-remove"
          @click="
            editing = false;
            emit('remove');
          "
        >
          <Icon name="trash-2" />{{ tr('删除', 'Delete') }}
        </button>
        <ProviderModels
          v-if="isMobile && mobilePanel === 'models'"
          ref="modelEditor"
          :id="id"
          :value="value"
          :preset="preset"
        />
        <section v-show="!isMobile || mobilePanel === 'connection'" class="preset-section">
          <header v-if="!isMobile">
            <h3>{{ tr('连接', 'Connection') }}</h3>
            <a v-if="profile?.documentation" :href="profile.documentation" target="_blank" rel="noreferrer">{{
              tr('官方说明', 'Documentation')
            }}</a>
          </header>
          <label
            >{{ tr('协议', 'Protocol')
            }}<SelectField
              mobile-page
              :aria-label="id + ' ' + tr('协议', 'Protocol')"
              :model-value="value.protocol"
              :options="options([...new Set([...(preset?.protocols ?? protocols), value.protocol])])"
              @update:model-value="emit('protocol', $event)"
          /></label>
          <div v-if="!isMobile" class="provider-toggle">
            <span>{{ tr('使用代理', 'Use proxy') }}</span
            ><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理', 'Use proxy')"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
          <div v-else class="mobile-settings-row">
            <span>{{ tr('使用代理', 'Use proxy') }}</span
            ><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理', 'Use proxy')"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
          <label>{{ tr('服务地址', 'Base URL') }}<input class="input" v-model="value.base_url" /></label>
          <label>{{ tr('请求路径', 'Request path') }}<input class="input" v-model="value.path" /></label>
          <div class="provider-headers">
            <span>{{ tr('请求头', 'Headers') }}</span
            ><KeyValueEditor
              :model-value="value.headers"
              :name-placeholder="tr('名称', 'Name')"
              :value-placeholder="tr('值', 'Value')"
              :add-label="tr('添加请求头', 'Add header')"
              @update:model-value="value.headers = $event ?? {}"
            />
          </div>
          <p v-if="profile?.note" class="hint">{{ profile.note }}</p>
        </section>
        <section v-show="!isMobile || mobilePanel === 'auth'" class="preset-section">
          <h3>{{ tr('身份验证', 'Authentication') }}</h3>
          <label
            >{{ tr('认证方式', 'Authentication method')
            }}<SelectField
              v-model="value.auth"
              :options="[
                { value: 'none', label: tr('无需认证', 'None') },
                { value: 'bearer', label: 'Bearer' },
                { value: 'anthropic_key', label: 'Anthropic API Key' },
                { value: 'google_key', label: 'Google API Key' },
                { value: 'sig_v4', label: 'AWS SigV4' },
              ]"
          /></label>
          <div v-if="value.auth !== 'none'" class="provider-account">
            <span>{{ tr('账户', 'Account') }}</span
            ><AccountPicker
              v-model="value.credential_id"
              :preset="value.preset ?? undefined"
              :allowed="profile?.codex ? ['openai_codex'] : copilot ? ['github_copilot'] : undefined"
            />
          </div>
        </section>
        <AnimatedDetails v-show="!isMobile || mobilePanel === 'advanced'" :open="isMobile" class="preset-section"
          ><summary>
            <span>{{ tr('高级设置', 'Advanced settings') }}</span
            ><Icon name="chevron-down" />
          </summary>
          <div class="advanced-fields">
            <label
              >{{ tr('模型列表协议', 'Catalog protocol')
              }}<SelectField
                mobile-page
                :model-value="value.model_list ?? ''"
                :options="
                  optional([
                    'openai_models',
                    'openai_codex_models',
                    'anthropic_models',
                    'google_models',
                    'qwen_models',
                    'bedrock_models',
                    'github_copilot_models',
                  ])
                "
                @update:model-value="value.model_list = $event || null"
            /></label>
            <label
              >{{ tr('模型列表地址', 'Catalog base URL')
              }}<input
                class="input"
                :value="value.model_list_base_url ?? ''"
                @input="value.model_list_base_url = ($event.target as HTMLInputElement).value || null"
            /></label>
            <label
              >{{ tr('模型列表路径', 'Catalog path')
              }}<input
                class="input"
                :value="value.model_list_path ?? ''"
                @input="value.model_list_path = ($event.target as HTMLInputElement).value || null"
            /></label>
            <label
              >{{ tr('Token 计数协议', 'Token count protocol')
              }}<SelectField
                mobile-page
                :model-value="value.token_count ?? ''"
                :options="optional(['openai_responses', 'anthropic_messages', 'google_generate_content'])"
                @update:model-value="value.token_count = $event || null"
            /></label>
            <label
              >{{ tr('上游压缩协议', 'Upstream compaction protocol')
              }}<SelectField
                mobile-page
                :model-value="value.compaction ?? ''"
                :options="optional(['openai_responses', 'openai_responses_streamed'])"
                @update:model-value="value.compaction = $event || null"
            /></label>
            <label
              >{{ tr('账户查询协议', 'Account protocol')
              }}<SelectField
                mobile-page
                :model-value="value.account_state ?? ''"
                :options="optional(ACCOUNT_PROTOCOLS)"
                @update:model-value="value.account_state = $event || null"
            /></label>
            <label
              >{{ tr('账户查询地址', 'Account base URL')
              }}<input
                class="input"
                :value="value.account_state_base_url ?? ''"
                :placeholder="tr('留空使用协议默认地址', 'Empty uses the protocol default')"
                @input="value.account_state_base_url = ($event.target as HTMLInputElement).value || null"
            /></label>
            <slot />
          </div>
        </AnimatedDetails>
        <a
          v-if="isMobile && mobilePanel === 'connection' && profile?.documentation"
          class="provider-documentation"
          :href="profile.documentation"
          target="_blank"
          rel="noreferrer"
          >{{ tr('官方说明', 'Documentation') }}<Icon name="external-link"
        /></a>
        <p v-if="!isMobile && preset?.unsupported_protocols.length" class="hint">
          {{
            tr(
              '图片生成协议尚未接入新后端；此处配置用于模型对话。',
              'Image generation protocols are not connected to the new backend; these presets configure model conversations.',
            )
          }}
        </p>
      </div>
      <template #actions
        ><button
          v-if="isMobile && mobilePanel === 'models'"
          type="button"
          class="btn ghost icon-only"
          :aria-label="tr('添加模型', 'Add model')"
          :data-hint="tr('添加模型', 'Add model')"
          @click="openModelAdd"
        >
          <Icon name="plus" /></button
      ></template>
      <template v-if="!isMobile" #footer
        ><span class="hint">{{
          tr('修改保留在设置草稿中，保存后生效。', 'Changes remain in the settings draft until saved.')
        }}</span
        ><button class="btn primary" @click="editing = false">{{ tr('完成', 'Done') }}</button></template
      >
    </Modal>
  </SettingsItemCard>
</template>
<style scoped>
.provider-account {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  align-items: center;
  gap: 8px 16px;
  min-width: 0;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
}
.provider-account > span {
  font-weight: 500;
}
@media (max-width: 899px) {
  .provider-account {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px 14px;
    border-top: 2px solid var(--bg-sunken);
  }
  .provider-account > span {
    font-size: 13.5px;
  }
}

/* The models button: the model mark and how many there are, beside "edit". */
.provider-models-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  min-height: 32px;
  padding: 0 9px;
  color: var(--fg-muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.provider-models-button .icon {
  width: 16px;
  height: 16px;
}
/* A provider's card beside the shared one: its brand at full strength, its id wrapping rather than cut. */
.provider-item :deep(.settings-item-mark) {
  color: var(--fg);
}
.provider-item :deep(.settings-item-heading small) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.chatgpt-login {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.chatgpt-login .btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.chatgpt-login .hint {
  width: 100%;
}
.copilot-code {
  width: 100%;
  font: 600 20px/1.4 var(--mono);
  letter-spacing: 0.12em;
  user-select: all;
}
.chatgpt-manual {
  width: 100%;
  display: grid;
  gap: 8px;
}
.chatgpt-manual-input {
  display: flex;
  gap: 8px;
}
.chatgpt-manual-input .input {
  flex: 1;
  min-width: 0;
}
.chatgpt-manual-input .btn {
  flex: none;
}
@media (max-width: 599px) {
  .chatgpt-manual-input {
    flex-direction: column;
  }
}

.provider-mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  color: var(--fg);
}

.preset-section {
  display: grid;
  gap: 14px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
  margin-top: 16px;
}
.preset-section > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.preset-section h3 {
  font-size: 14px;
  margin: 0;
}
.preset-section label {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  align-items: center;
  gap: 8px 16px;
  min-width: 0;
}
.preset-section label > small {
  grid-column: 2;
}
.provider-headers {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  align-items: start;
  gap: 8px 16px;
  min-width: 0;
}
.provider-headers > span {
  padding-top: 9px;
}
.preset-section p {
  margin: 0;
}
.advanced-fields {
  display: grid;
  gap: 14px;
  padding-top: 14px;
  min-width: 0;
}
.provider-name {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  align-items: center;
  gap: 8px 16px;
}
.preset-section summary {
  cursor: pointer;
  font-weight: 500;
}
.input {
  width: 100%;
  min-width: 0;
}
a,
.hint {
  font-size: 12px;
  color: var(--fg-subtle);
}
@media (max-width: 599px) {
  .provider-name {
    grid-template-columns: 1fr;
  }
  .preset-section :is(label, .provider-headers) {
    grid-template-columns: minmax(0, 1fr);
  }
  .provider-headers > span {
    padding-top: 0;
  }
  .preset-section label > small {
    grid-column: 1;
  }
}
@media (min-width: 900px) {
  .preset-section {
    gap: 10px;
    padding-top: 12px;
    margin-top: 12px;
  }
  .advanced-fields {
    gap: 10px;
    padding-top: 10px;
  }
}
@media (max-width: 899px) {
  /* Providers are rows of one grouped list; dividers start after the icon. */

  .provider-hero .provider-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
  .provider-hero {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 4px 20px;
  }
  .provider-hero .provider-mark {
    width: 52px;
    height: 52px;
    border-radius: 14px;
  }
  .provider-hero .provider-mark :deep(.provider-icon) {
    transform: scale(1.25);
  }
  .provider-hero div {
    min-width: 0;
  }
  .provider-hero strong {
    display: block;
    font-size: 19px;
    font-weight: 600;
    line-height: 1.35;
  }
  .provider-hero small {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--fg-subtle);
    overflow-wrap: anywhere;
  }
  .provider-form > .provider-name {
    display: block;
    margin-bottom: 20px;
    padding: 12px 14px;
    border: 0;
    border-radius: 18px;
    background: var(--bg-group);
    font-size: 13px;
    color: var(--fg-muted);
  }
  .provider-name .input {
    margin-top: 8px;
  }
  .mobile-provider-remove {
    width: 100%;
    min-height: 52px;
    margin-top: 0;
    border-radius: 18px;
  }
}
@media (max-width: 899px) {
  .provider-panel .preset-section {
    padding: 0;
    gap: 0;
    overflow: hidden;
  }
  .provider-panel .preset-section > header {
    padding: 0 14px;
  }
  .provider-panel .preset-section > header:not(:has(a)) {
    display: none;
  }
  .provider-panel .preset-section :is(label, .provider-headers) {
    padding: 12px 14px;
  }
  .provider-panel .provider-headers {
    font-size: 13.5px;
    font-weight: 500;
  }
  .provider-panel .preset-section > .hint {
    padding: 12px 14px;
  }
  .provider-panel .preset-section label > .hint {
    display: block;
    margin-top: 8px;
    line-height: 1.6;
  }
  .provider-panel .preset-section > .chatgpt-login {
    padding: 14px;
    border-top: 1px solid var(--line);
  }
  .provider-panel .chatgpt-login > .btn {
    width: 100%;
    min-height: 44px;
    justify-content: center;
  }
  .provider-panel .preset-section .mobile-settings-row {
    border-block: 2px solid var(--bg-sunken);
  }
  .provider-panel .advanced-fields {
    gap: 0;
  }
}
@media (max-width: 899px) {
  .provider-form.mobile-fields {
    animation: provider-panel-in 180ms var(--ease-out);
  }
  .provider-form.mobile-fields.returning {
    animation-name: provider-panel-back;
  }
}
@keyframes provider-panel-in {
  from {
    opacity: 0.4;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
@keyframes provider-panel-back {
  from {
    opacity: 0.4;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
.provider-documentation {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 12px 14px;
  line-height: 1.5;
  text-decoration: none;
}
.provider-documentation .icon {
  width: 14px;
  height: 14px;
}
@media (hover: hover) {
  .provider-documentation:hover {
    color: var(--fg);
  }
}
@media (min-width: 900px) {
  /* The editor groups its fields into the same cards as the settings page. */
  .provider-form {
    display: grid;
    gap: 16px;
  }
  .provider-form > .provider-name {
    margin: 0;
    padding: 10px 16px;
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 12px 12px 0 0;
    background: var(--bg-raised);
    font-weight: 500;
  }
  .provider-form > .provider-name + .provider-toggle {
    margin-top: -16px;
    border: 1px solid var(--line);
    border-radius: 0 0 12px 12px;
    background: var(--bg-raised);
  }
  .provider-form > .provider-name + .provider-toggle::before {
    content: '';
    position: absolute;
    left: 16px;
    right: 16px;
    top: -1px;
    border-top: 1px solid var(--line);
  }
  .provider-toggle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    padding: 8px 16px;
    font-weight: 500;
  }
  .preset-section {
    gap: 0;
    margin: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg-raised);
    overflow: hidden;
  }
  .preset-section > header,
  .preset-section > h3 {
    margin: 0;
    padding: 14px 16px 4px;
    font-size: 13px;
  }
  .preset-section > header h3 {
    font-size: 13px;
  }
  .preset-section > header a {
    font-size: 12px;
  }
  .preset-section > :is(label, .provider-toggle, .provider-headers, .hint, .chatgpt-login) {
    margin: 0;
    padding: 10px 16px;
  }
  .preset-section > :is(label, .provider-toggle, .provider-headers) + :is(label, .provider-toggle, .provider-headers) {
    border-top: 1px solid var(--line);
  }
  .provider-headers > span {
    font-weight: 500;
  }
  .preset-section > .hint {
    padding-block: 2px 8px;
    font-size: 12px;
    color: var(--fg-subtle);
  }
  .preset-section label {
    font-weight: 500;
  }
  .preset-section label > :is(.input, .control-select, small) {
    font-weight: 400;
  }
  .preset-section > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 48px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
    list-style: none;
  }
  .preset-section > summary::-webkit-details-marker {
    display: none;
  }
  .preset-section > summary .icon {
    width: 15px;
    height: 15px;
    color: var(--fg-subtle);
    transition: transform var(--dur-fast);
  }
  .preset-section[open] > summary .icon {
    transform: rotate(180deg);
  }
  .advanced-fields {
    gap: 0;
    padding: 0 0 4px;
  }
  .advanced-fields > label {
    padding: 10px 16px;
    border-top: 1px solid var(--line);
  }
  .advanced-fields :deep(.provider-json) {
    margin: 0;
    padding: 4px 16px 12px;
  }
}
</style>
