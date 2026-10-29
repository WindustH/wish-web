<script setup lang="ts">
import { computed, inject, reactive, shallowRef, watch } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import SwitchRow from '../../ui/domain/settings/SwitchRow.vue';
import SelectField from '../../ui/domain/providers/SelectField.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { configDraftKey } from './useConfigDraft.ts';
import { useChatgptLogin } from '../providers/useChatgptLogin.ts';
import { useCopilotLogin } from '../providers/useCopilotLogin.ts';
import { REDACTED, secretText, readSecret, writeCredential } from '../../core/secretRef.ts';
import { useAccountCatalog } from './useAccountCatalog.ts';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ id: string; allowRemove?: boolean; linked?: boolean }>();
const emit = defineEmits<{ close: []; remove: [] }>();
const { draft, saveConfig, load } = inject(configDraftKey)!;
const mobile = useIsMobile();
const accountCatalog = useAccountCatalog();
const account = computed(() => draft.value.accounts[props.id]);
const login = reactive(useChatgptLogin(() => `account:${props.id}`, saveConfig, load));
const copilot = reactive(useCopilotLogin(() => `account:${props.id}`, saveConfig, load));
// Keep saved placeholders while a replacement is typed and then erased.
const savedSecrets = shallowRef<{ api_key?: string | null; credentials?: Record<string, string> }>({});
watch(
  account,
  (value) => {
    savedSecrets.value = JSON.parse(JSON.stringify(value ?? {}));
  },
  { immediate: true },
);
const fields = computed(() => [
  ...new Set([
    ...(accountCatalog.value.find((p) => p.id === account.value.preset)?.fields ?? []),
    ...Object.keys(account.value.credentials ?? {}),
    ...Object.keys(account.value.credentials_env ?? {}),
  ]),
]);
function credentialLabel(name: string) {
  if (name === 'access_key_id') return 'Access Key ID (AK)';
  if (name === 'secret_access_key') return 'Secret Access Key (SK)';
  if (name === 'session_token') return tr('临时安全令牌（可选）', 'Session token (optional)');
  return name;
}
function key(text: string) {
  const x = readSecret(text, savedSecrets.value.api_key === REDACTED ? REDACTED : null);
  account.value.api_key = x.value;
  account.value.api_key_env = x.env;
}
function field(name: string, text: string) {
  writeCredential(
    (account.value.credentials ??= {}),
    (account.value.credentials_env ??= {}),
    name,
    text,
    savedSecrets.value.credentials?.[name] === REDACTED ? REDACTED : null,
  );
}
</script>
<template>
  <Modal
    v-if="account"
    :open="true"
    :page="mobile"
    :content-class="mobile ? 'settings-editor mobile-settings-page account-editor' : 'settings-editor account-editor'"
    :title="tr('账户', 'Account')"
    @close="emit('close')"
  >
    <div class="account-form">
      <div class="set-card">
        <label class="set-row stacked"
          ><span class="set-label">{{ tr('名称', 'Name') }}</span
          ><input class="input" v-model="account.name"
        /></label>
        <label class="set-row stacked"
          ><span class="set-label">{{ tr('平台 / 账户类型', 'Platform / account type') }}</span
          ><SelectField
            :model-value="account.preset || 'custom'"
            @update:model-value="account.preset = $event"
            :options="[
              { value: 'custom', label: tr('自定义 API Key', 'Custom API key') },
              ...(account.preset && account.preset !== 'custom' && !accountCatalog.some((p) => p.id === account.preset)
                ? [{ value: account.preset, label: account.preset }]
                : []),
              ...accountCatalog.map((p) => ({
                value: p.id,
                label: p.name,
                brand: p.brand,
                annotation: p.description,
              })),
            ]"
        /></label>
      </div>
      <div class="set-card">
        <label
          v-if="
            account.preset === 'custom' ||
            !account.preset ||
            account.api_key ||
            account.api_key_env ||
            (!fields.includes('access_key_id') && !fields.includes('secret_access_key'))
          "
          class="set-row stacked"
          ><span class="set-label">{{
            account.preset === 'novelai' ? 'Persistent API Token' : 'API Key / Access token'
          }}</span
          ><input
            class="input"
            :type="account.api_key_env ? 'text' : 'password'"
            :value="secretText(account.api_key, account.api_key_env)"
            :placeholder="
              tr('输入密钥或 ${ENV_NAME}；留空保留已保存值', 'Key or ${ENV_NAME}; leave unchanged to retain')
            "
            autocomplete="new-password"
            @input="key(($event.target as HTMLInputElement).value)"
        /></label>
        <label v-if="account.preset === 'custom' || !account.preset" class="set-row stacked">
          <span class="set-label">{{ tr('添加凭据字段', 'Add credential field') }}</span>
          <SelectField
            model-value=""
            :options="[
              { value: '', label: tr('选择字段…', 'Choose a field…') },
              ...['access_key_id', 'secret_access_key', 'session_token', 'region', 'access_token', 'refresh_token']
                .filter((name) => !fields.includes(name))
                .map((name) => ({ value: name, label: credentialLabel(name) })),
            ]"
            @update:model-value="
              (name) => {
                if (name) (account.credentials ??= {})[name] = '';
              }
            "
          />
        </label>
        <label v-for="name in fields" :key="name" class="set-row stacked"
          ><span class="set-label">{{ credentialLabel(name) }}</span
          ><input
            class="input"
            type="password"
            :value="secretText(account.credentials?.[name], account.credentials_env?.[name])"
            autocomplete="new-password"
            @input="field(name, ($event.target as HTMLInputElement).value)"
        /></label>
      </div>
      <div v-if="account.preset === 'openai_codex'" class="set-card account-signin">
        <button class="btn" :disabled="login.submitting" @click="login.start">
          {{ tr('通过 ChatGPT 登录', 'Sign in with ChatGPT') }}
        </button>
        <a v-if="login.url" :href="login.url" target="_blank" rel="noopener noreferrer">{{
          tr('打开授权页面', 'Open authorization page')
        }}</a>
        <p v-if="login.message">{{ login.message }}</p>
        <template v-if="login.busy"
          ><input
            class="input"
            v-model="login.callbackUrl"
            :placeholder="tr('粘贴授权后的 localhost 链接', 'Paste localhost callback URL')"
          /><button class="btn" @click="login.complete">{{ tr('完成登录', 'Complete sign-in') }}</button></template
        >
      </div>
      <div v-if="account.preset === 'github_copilot'" class="set-card account-signin">
        <button class="btn" @click="copilot.start">{{ tr('通过 GitHub 登录', 'Sign in with GitHub') }}</button>
        <p>{{ copilot.message }}</p>
        <strong v-if="copilot.code">{{ copilot.code }}</strong
        ><a v-if="copilot.url" :href="copilot.url" target="_blank" rel="noopener noreferrer">{{
          tr('打开授权页面', 'Open authorization page')
        }}</a>
      </div>
      <div class="set-card">
        <SwitchRow
          v-model="account.proxy_enabled"
          :name="tr('登录与续期使用代理', 'Use proxy for sign-in and renewal')"
        />
      </div>
      <p class="hint">
        {{
          tr(
            '更换凭据会应用到此账户关联的所有服务。',
            'Credential changes apply to all services linked to this account.',
          )
        }}
      </p>
    </div>
    <template #footer
      ><button
        v-if="allowRemove !== undefined"
        class="btn ghost icon-only settings-delete"
        :disabled="!allowRemove"
        :aria-label="tr('删除账户', 'Delete account')"
        @click="emit('remove')"
      >
        <Icon :name="allowRemove && !linked ? 'trash-2' : 'trash-off'" /></button
      ><button class="btn primary" @click="emit('close')">{{ tr('完成', 'Done') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.account-form {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.account-form .set-label {
  font-size: 13px;
  color: var(--fg-muted);
}
.account-signin {
  display: grid;
  gap: 10px;
  padding: 14px;
  overflow-wrap: anywhere;
}
.account-signin p {
  margin: 0;
}
.hint {
  margin: 0 4px;
  color: var(--fg-subtle);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 899px) {
  .account-form {
    gap: 16px;
  }
  .account-form .set-row {
    gap: 5px;
  }
  .account-form .set-row > .input,
  .account-form .set-row > :deep(.control-select) {
    min-height: 34px;
    padding: 4px 0;
    border: 0;
    border-bottom: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-size: 16px;
  }
  .account-form .set-row > .input:focus,
  .account-form .set-row > :deep(.control-select:focus-visible),
  .account-form .set-row > :deep(.control-select[data-state='open']) {
    background: transparent;
    border-bottom-color: var(--accent);
  }
  .account-signin {
    border-radius: 18px;
    background: var(--bg-group);
  }
  .hint {
    margin-inline: 14px;
  }
}
</style>
