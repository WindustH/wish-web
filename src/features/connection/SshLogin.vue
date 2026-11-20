<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { loginSsh } from './loginSsh.ts';
import { errorText } from '../../core/errors.ts';
import { tr } from '../../core/i18n/tr.ts';
import { platform } from '../../platform/index.ts';
import AccountTokenField from './AccountTokenField.vue';
import SshKeyManager from './SshKeyManager.vue';
import Icon from '../../ui/components/Icon.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { hostPinKey, listKeys, type BrowserKey } from './sshKeys.ts';

import type { AccountLogin, SavedAccount } from '../../core/connectionAccounts.ts';
import { isNativeApp } from '../../platform/native.ts';
const props = defineProps<{ account?: SavedAccount; accountName?: string; editingAccount?: boolean }>();
const emit = defineEmits<{ busy: [value: boolean]; changed: [] }>();
const store = platform('storage');
const apiPort = ref(props.account?.apiPort ?? 9780);
const address = ref(props.account?.address ?? '');
const hostId = computed(() => hostPinKey(address.value));
const known = ref(store.get(hostId.value));
const forget = ref(false);
function forgetHost() {
  token.value = '';
  store.remove(hostId.value);
  known.value = null;
  forget.value = false;
  fingerprint.value = '';
  error.value = '';
}
const selection = ref(props.account?.identity ?? (store.get('ssh.identity') || ''));
const keys = shallowRef<BrowserKey[]>([]);
const selected = computed(() => keys.value.find((k) => k.id === selection.value));
const options = computed(() => [
  { value: '', label: tr('系统 SSH 密钥', 'System SSH key') },
  ...keys.value.map((k) => ({ value: k.id, label: k.name })),
]);
const manageKeys = ref(false);
const busy = ref(false);
const error = ref('');
const fingerprint = ref('');
const token = ref(
  props.account && (props.editingAccount || props.account.fingerprint === known.value) ? props.account.token : '',
);
watch(
  [address, selection, apiPort, token],
  () => {
    error.value = '';
    emit('changed');
  },
  { flush: 'sync' },
);
watch(busy, (value) => emit('busy', value), { flush: 'sync' });
watch(
  [address, selection, apiPort],
  () => {
    if (props.account) token.value = '';
  },
  { flush: 'sync' },
);
watch(address, () => {
  known.value = store.get(hostId.value);
  forget.value = false;
  fingerprint.value = '';
  error.value = '';
});
onMounted(async () => {
  try {
    keys.value = await listKeys();
    if (selection.value && !selected.value) {
      if (props.account)
        throw new Error(
          tr('保存的登录密钥已删除，请选择密钥后重新连接。', 'The saved key was removed. Select a key to reconnect.'),
        );
      selection.value = '';
    }
  } catch (e) {
    error.value = errorText(e);
  }
});
async function submit(signal?: AbortSignal) {
  if (busy.value || !address.value.trim()) return;
  error.value = '';
  busy.value = true;
  try {
    if (selection.value && !selected.value)
      throw new Error(tr('请选择可用的登录密钥。', 'Select an available login key.'));
    const login = draftLogin();
    const pin = known.value || fingerprint.value;
    fingerprint.value =
      (await loginSsh(
        login.address,
        login.apiPort,
        selected.value,
        pin,
        token.value.trim(),
        props.accountName || '',
        props.account?.id,
        signal,
      )) || '';
  } catch (e) {
    if (!signal?.aborted) error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
function draftLogin(): AccountLogin {
  const text = address.value.trim();
  let url: URL;
  try {
    url = new URL(text.includes('://') ? text : 'ssh://' + text);
  } catch {
    throw new Error(tr('请输入有效的 SSH 地址。', 'Enter a valid SSH address.'));
  }
  if (
    url.protocol !== 'ssh:' ||
    !url.hostname ||
    url.password ||
    !['', '/'].includes(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error(tr('请输入有效的 SSH 地址。', 'Enter a valid SSH address.'));
  if (!Number.isInteger(apiPort.value) || apiPort.value < 1 || apiPort.value > 65535)
    throw new Error(tr('API 端口必须是 1 到 65535 的整数。', 'Enter an API port from 1 to 65535.'));
  return {
    method: 'ssh',
    address: text,
    token: token.value.trim(),
    identity: selection.value,
    apiPort: apiPort.value,
    fingerprint: known.value && text === props.account?.address ? props.account.fingerprint : known.value || '',
  };
}
defineExpose({ draftLogin, submit, canSubmit: computed(() => !!address.value.trim() && !busy.value), fingerprint });
</script>

<template>
  <div class="ssh-login">
    <label class="field"
      ><span>{{ tr('SSH 地址', 'SSH address') }}</span>
      <input
        v-model="address"
        class="input"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        placeholder="ssh://host:2222"
        :disabled="busy"
      />
    </label>
    <div class="field">
      <span id="ssh-key-label">{{ tr('登录密钥', 'Login key') }}</span>
      <div class="key-choice">
        <SelectField
          mobile-page
          v-model="selection"
          :options="options"
          aria-labelledby="ssh-key-label"
          :disabled="busy"
        />

        <button
          type="button"
          class="btn ghost manage-keys"
          :aria-label="tr('管理 SSH 密钥', 'Manage SSH keys')"
          @click="manageKeys = true"
        >
          <Icon name="key" :size="16" />{{ tr('管理', 'Manage') }}<Icon name="arrow-up-right" :size="14" />
        </button>
      </div>
    </div>
    <label v-if="isNativeApp()" class="field"
      ><span>{{ tr('后端 API 端口', 'Backend API port') }}</span
      ><input class="input" type="number" v-model.number="apiPort" min="1" max="65535"
    /></label>
    <AccountTokenField v-model="token" :label="tr('后端访问令牌', 'Backend access token')" />
    <div v-if="known">
      <div class="ssh-actions">
        <button type="button" class="btn ghost" :disabled="busy" @click="forget = !forget">
          {{ tr('管理主机指纹', 'Host fingerprint') }}
        </button>
        <template v-if="forget"
          ><code>{{ known }}</code>
          <button type="button" class="btn danger" @click="forgetHost">
            {{ tr('忘记此指纹', 'Forget fingerprint') }}
          </button>
        </template>
      </div>
    </div>
    <p v-if="fingerprint" class="ssh-pin">
      {{ tr('请与后端启动时显示的主机指纹核对', 'Compare with the host fingerprint printed by the backend')
      }}<code>{{ fingerprint }}</code>
    </p>
    <SshKeyManager
      v-if="manageKeys"
      :keys="keys"
      :selected-id="selection"
      @close="manageKeys = false"
      @changed="keys = $event"
      @select="selection = $event"
    />
    <p v-if="error" role="alert" class="connect-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.ssh-login {
  display: grid;
  gap: 12px;
}
.ssh-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.key-choice {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px;
  align-items: center;
}
.ssh-actions code {
  overflow-wrap: anywhere;
  min-width: 0;
}
.ssh-pin {
  margin: 0;
  font-size: 13px;
}
.ssh-pin code {
  display: block;
  overflow-wrap: anywhere;
  margin-top: 6px;
}
</style>
