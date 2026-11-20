<script setup lang="ts">
// The sign-in page, after signing out or when a server wants a token: which Wish server to use, and
// its token.
import { errorText } from '../../core/errors.ts';
import { computed, defineAsyncComponent, onMounted, ref, shallowRef } from 'vue';
import AccountTokenField from './AccountTokenField.vue';
import Wordmark from '../../ui/components/Wordmark.vue';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';
import {
  apiBaseFor,
  httpAccount,
  checkConnection,
  disconnectBrowserSsh,
  connect,
  isDeviceSshClient,
  lastAddress,
  loginAccounts,
} from '../../core/connection.ts';

import { savedAccounts, forgetAccount, updateAccount, type SavedAccount } from '../../core/connectionAccounts.ts';
import SelectField from '../../ui/components/SelectField.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import '../../domain/settings/settings.css';
import { isNativeApp, nativeLogout } from '../../platform/native.ts';
defineEmits<{ settings: [] }>();
const mobile = useIsMobile();
const native = isNativeApp();
const SshLogin = defineAsyncComponent(() => import('./SshLogin.vue'));
const sshForm = ref<InstanceType<typeof SshLogin>>();
const ssh = ref(native);
const sshClient = ref(native);
const ready = ref(false);
const accounts = shallowRef(loginAccounts());
const keyNames = shallowRef(new Map<string, string>());
const choices = computed(() => accounts.value.filter((a) => native || (a.method === 'ssh') === sshClient.value));
const selected = shallowRef<SavedAccount>();
const form = ref(false);
const editing = ref(false);
const removing = shallowRef<SavedAccount>();
const accountName = ref('');
const opening = ref(false);
let attempt: AbortController | undefined;
const cancelling = ref(false);
async function cancelAttempt() {
  if (cancelling.value) return;
  if (!attempt) return back();
  cancelling.value = true;
  attempt.abort();
  try {
    if (native) await nativeLogout();
    else if (ssh.value) await disconnectBrowserSsh();
  } finally {
    attempt = undefined;
    opening.value = busy.value = cancelling.value = false;
    back();
  }
}

const address = ref(lastAddress());
onMounted(async () => {
  sshClient.value = native || (await isDeviceSshClient());
  ssh.value = native ? lastAddress() === '' : sshClient.value;
  ready.value = true;
  if (choices.value.some((a) => a.method === 'ssh' && a.identity && !a.name)) {
    try {
      const { listKeys } = await import('./sshKeys.ts');
      keyNames.value = new Map((await listKeys()).map((key) => [key.id, key.name]));
    } catch {
      /* The card can still show the host if device key storage is unavailable. */
    }
  }
});
function accountAddress(a: SavedAccount) {
  return a.address.replace(/^ssh:\/\//, '') || location.host;
}
function accountTitle(a: SavedAccount) {
  return (
    a.name ||
    keyNames.value.get(a.identity) ||
    accountAddress(a)
      .replace(/^https?:\/\//, '')
      .replace(/\/api$/, '')
  );
}
function accountDetail(a: SavedAccount) {
  const transport = a.method === 'ssh' ? 'SSH' : /^https:/i.test(a.address || location.href) ? 'HTTPS' : 'HTTP';
  const endpoint = accountAddress(a)
    .replace(/^https?:\/\//, '')
    .replace(/\/api$/, '');
  const detail = endpoint === accountTitle(a) ? [] : [endpoint];
  if (a.method === 'ssh' && a.apiPort !== 9780) detail.push('API ' + a.apiPort);
  const duplicate = choices.value.some(
    (other) => other.id !== a.id && accountTitle(other) === accountTitle(a) && other.address === a.address,
  );
  return [transport, ...detail, ...(duplicate ? [a.id.slice(0, 6)] : [])].join(' · ');
}
function newAccount() {
  editing.value = false;
  selected.value = undefined;
  address.value = token.value = error.value = accountName.value = '';
  ssh.value = sshClient.value;
  form.value = true;
  removing.value = undefined;
}
function back() {
  editing.value = false;
  form.value = false;
  selected.value = undefined;
  error.value = token.value = '';
}
function loadAccount(a: SavedAccount) {
  selected.value = a;
  accountName.value = a.name;
  removing.value = undefined;
  ssh.value = a.method === 'ssh';
  address.value = a.address;
  token.value = a.method === 'http' ? a.token : '';
  error.value = '';
}
function editAccount(a: SavedAccount) {
  loadAccount(a);
  editing.value = true;
  form.value = true;
}
async function choose(a: SavedAccount) {
  if (busy.value || opening.value) return;
  loadAccount(a);
  editing.value = false;
  opening.value = true;
  const { signal } = (attempt = new AbortController());
  try {
    if (ssh.value) {
      const { loginSavedSsh } = await import('./loginSsh.ts');
      await loginSavedSsh(a, signal);
    } else {
      await checkConnection(a.address, a.token, signal);
      await connect(a.address, a.token, a.name, a.id, signal);
    }
  } catch (cause) {
    if (signal.aborted) return;
    error.value = errorText(cause);
    form.value = true;
  } finally {
    if (!signal.aborted) {
      opening.value = false;
      attempt = undefined;
    }
  }
}
function remove(a: SavedAccount) {
  forgetAccount(a.id);
  accounts.value = savedAccounts();
  removing.value = undefined;
}
const token = ref('');
const error = ref('');
const busy = ref(false);
async function submitForm() {
  if (cancelling.value || busy.value) return;
  if (!editing.value || !selected.value) {
    const { signal } = (attempt = new AbortController());
    try {
      await (ssh.value ? sshForm.value?.submit(signal) : submit(signal));
    } finally {
      if (!signal.aborted) attempt = undefined;
    }
    return;
  }
  try {
    const login = ssh.value ? sshForm.value?.draftLogin() : httpAccount(apiBaseFor(address.value), token.value.trim());
    if (!login) return;
    const id = selected.value.id,
      name = accountName.value;
    busy.value = true;
    if (login.identity) {
      const { withStoredKey } = await import('./sshKeys.ts');
      await withStoredKey(login.identity, () => {
        updateAccount(id, login, name);
      });
    } else updateAccount(id, login, name);
    accounts.value = savedAccounts();
    back();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function submit(signal: AbortSignal) {
  if (busy.value || (native && !address.value.trim())) return;
  busy.value = true;
  error.value = '';
  const target = address.value;
  const credential = token.value.trim();
  try {
    await checkConnection(target, credential, signal);
    await connect(target, credential, accountName.value, selected.value?.id, signal);
  } catch (cause) {
    if (signal.aborted) return;
    error.value = errorText(cause);
    busy.value = false;
  }
}
</script>

<template>
  <main class="connect-view account-chooser">
    <div class="connect-card">
      <header class="account-header">
        <div class="connect-brand" aria-hidden="true">
          <img src="/app-icons/mark.svg" alt="" /><Wordmark class="connect-wordmark" />
        </div>
        <button
          type="button"
          class="btn ghost icon-only device-settings"
          :aria-label="tr('设置', 'Settings')"
          :title="tr('设置', 'Settings')"
          :disabled="opening"
          @click="$emit('settings')"
        >
          <Icon name="settings" />
        </button>
      </header>
      <h1 v-if="!mobile" class="accounts-title">{{ tr('选择账户', 'Choose an account') }}</h1>
      <div v-if="ready" class="account-list" role="group" :aria-label="tr('选择账户', 'Choose an account')">
        <div v-for="a in choices" :key="a.id" class="saved-account">
          <button class="account-login" type="button" :disabled="opening" @click="choose(a)">
            <span class="account-icon"><Icon :name="a.method === 'ssh' ? 'key' : 'monitor'" /></span>
            <span class="account-text"
              ><strong>{{ accountTitle(a) }}</strong
              ><small>{{ accountDetail(a) }}</small></span
            >
            <Icon v-if="opening && selected?.id === a.id" name="loader-circle" class="spin" :size="16" />
          </button>
          <Menu
            v-if="!opening"
            :items="[
              { key: 'edit', label: tr('编辑账户', 'Edit account'), icon: 'pencil' },
              { key: 'remove', label: tr('移除账户', 'Remove account'), icon: 'trash-2', danger: true },
            ]"
            align="end"
            @select="$event === 'edit' ? editAccount(a) : (removing = a)"
          >
            <template #trigger
              ><button
                type="button"
                class="btn ghost icon-only account-more"
                :aria-label="tr('账户选项', 'Account options') + ' · ' + accountTitle(a)"
              >
                <Icon name="ellipsis-vertical" :size="16" /></button
            ></template>
          </Menu>
        </div>
        <button
          type="button"
          class="add-account"
          :disabled="opening"
          @click="newAccount"
          :aria-label="tr('添加账户', 'Add account')"
          :title="tr('添加账户', 'Add account')"
        >
          <Icon name="plus" :size="28" />
        </button>
      </div>
      <button v-if="opening" class="btn ghost" :disabled="cancelling" @click="cancelAttempt">
        {{ tr('取消连接', 'Cancel connection') }}
      </button>
      <Modal compact :open="!!removing" :title="tr('移除账户？', 'Remove account?')" @close="removing = undefined">
        <p v-if="removing">
          {{
            tr(
              '从此设备移除「' + accountTitle(removing) + '」的登录信息。',
              'Remove the saved login for ' + accountTitle(removing) + ' from this device.',
            )
          }}
        </p>
        <template #footer
          ><button class="btn ghost" @click="removing = undefined">{{ tr('取消', 'Cancel') }}</button
          ><button class="btn danger" @click="removing && remove(removing)">
            {{ tr('移除', 'Remove') }}
          </button></template
        >
      </Modal>
      <Modal
        :open="form"
        compact
        :page="mobile"
        :dismissable="!cancelling && (!busy || !editing)"
        :title="
          editing
            ? tr('编辑账户', 'Edit account')
            : selected
              ? tr('连接账户', 'Connect account')
              : tr('添加账户', 'Add account')
        "
        content-class="connection-editor"
        @close="cancelAttempt"
      >
        <form id="server-account-form" @submit.prevent="submitForm">
          <fieldset class="connection-fields" :disabled="busy">
            <label class="field"
              ><span>{{ tr('显示名称', 'Display name') }}</span
              ><input v-model="accountName" class="input" maxlength="64" :placeholder="tr('可选', 'Optional')"
            /></label>
            <div v-if="native && !selected" class="field">
              <span>{{ tr('连接方式', 'Connection method') }}</span>
              <SelectField
                segmented
                :aria-label="tr('连接方式', 'Connection method')"
                :model-value="ssh ? 'ssh' : 'http'"
                :options="[
                  { value: 'ssh', label: 'SSH' },
                  { value: 'http', label: 'HTTP(S)' },
                ]"
                @update:model-value="
                  ssh = $event === 'ssh';
                  error = '';
                "
              />
            </div>
            <SshLogin
              v-if="ssh"
              ref="sshForm"
              :editing-account="editing"
              :account="selected"
              :account-name="accountName"
              @changed="error = ''"
              @busy="busy = $event"
            />
            <template v-else>
              <label class="field"
                ><span>{{ tr('服务器地址', 'Server address') }}</span
                ><input
                  v-model="address"
                  @input="token = ''"
                  class="input"
                  type="text"
                  inputmode="url"
                  autocomplete="url"
                  autocapitalize="off"
                  spellcheck="false"
                  :placeholder="
                    native ? 'https://wish.example.com' : tr('留空使用当前服务器', 'Leave empty for this server')
                  "
              /></label>
              <AccountTokenField v-model="token" :label="tr('访问令牌', 'Access token')" />
            </template>
            <p v-if="error" class="connect-error" role="alert"><Icon name="triangle-alert" />{{ error }}</p>
          </fieldset>
        </form>
        <template #footer
          ><button class="btn ghost" type="button" :disabled="cancelling || (busy && editing)" @click="cancelAttempt">
            {{ tr('取消', 'Cancel') }}</button
          ><button
            type="submit"
            form="server-account-form"
            class="btn primary connect-submit"
            :disabled="busy || (ssh ? !sshForm?.canSubmit : native && !address.trim())"
          >
            {{
              editing
                ? tr('保存', 'Save')
                : busy
                  ? tr('正在连接…', 'Connecting…')
                  : ssh && sshForm?.fingerprint
                    ? tr('信任此主机并连接', 'Trust host and connect')
                    : tr('连接', 'Connect')
            }}
          </button></template
        >
      </Modal>
    </div>
  </main>
</template>

<style>
.connection-editor.compact,
.ssh-key-create.compact {
  width: min(92vw, 25rem);
}
.connection-editor .field,
.ssh-key-create .field {
  margin: 0;
  gap: 4px;
}
.connection-editor .modal-flow-title,
.ssh-key-create .modal-flow-title {
  margin-bottom: 12px;
}
.connect-view {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  align-items: safe center;
  justify-content: center;
  padding: max(32px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: var(--bg);
}
.connect-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.connect-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.connect-brand img {
  display: block;
  width: 30px;
  height: auto;
}
.connect-wordmark {
  height: 17px;
  color: var(--fg);
}
.connect-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--err) 8%, transparent);
  font-size: 13px;
  line-height: 1.6;
  color: var(--err);
}
.connect-error .icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 3px;
}
</style>

<style scoped>
.account-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.connection-fields {
  display: grid;
  gap: 12px;
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.account-chooser {
  align-items: flex-start;
  padding-block-start: calc(env(safe-area-inset-top, 0px) + 8px);
}
.account-chooser .connect-card {
  max-width: 460px;
  gap: 12px;
}
.account-chooser .connect-brand {
  margin: 0;
}
.account-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(10px, 2.5vw, 16px);
}
.saved-account,
.add-account {
  position: relative;
  border-radius: 14px;
  aspect-ratio: 1.15;
  border: 1px solid var(--line);
  min-width: 0;
}
.saved-account {
  display: flex;
  background: var(--bg-raised);
  transition:
    background var(--dur-fast),
    border-color var(--dur-fast);
}
.account-login {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: clamp(12px, 3vw, 20px);
  min-width: 0;
  appearance: none;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
  color: var(--fg);
  text-align: start;
}
.account-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}
.account-text {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 3px;
}
.account-text strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.35;
  font-weight: 600;
}
.account-text small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg-subtle);
  font-size: 12px;
  line-height: 1.4;
}
.account-more,
.account-login > .spin {
  position: absolute;
  top: 5px;
  right: 5px;
}
.account-login > .spin {
  margin: 10px;
  color: var(--accent);
}
.add-account {
  display: grid;
  place-items: center;
  appearance: none;
  background: transparent;
  border-style: dashed;
  border-color: var(--line-strong);
  color: var(--fg-subtle);
  cursor: pointer;
}
.account-login:disabled,
.add-account:disabled {
  cursor: default;
}
.account-login:focus-visible {
  outline: none;
}
.account-login:focus-visible strong {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.saved-account:has(.account-login:focus-visible),
.add-account:focus-visible {
  background: var(--bg-hover);
}
@media (hover: hover) {
  .saved-account:has(.account-login:hover:not(:disabled)),
  .add-account:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--line-strong);
  }
  .add-account:hover:not(:disabled) {
    color: var(--accent);
  }
}
@media (pointer: coarse) {
  .account-more {
    min-height: 44px;
    min-width: 44px;
  }
}
@media (max-width: 899px) {
  .account-header .device-settings {
    min-width: 44px;
    min-height: 44px;
  }
}
.accounts-title {
  margin: 0;
  font: 600 21px/1.4 var(--font);
}
@media (min-width: 900px) {
  .connect-view.account-chooser {
    padding: clamp(32px, 6vh, 64px) clamp(40px, 7vw, 112px);
  }
  .account-chooser .connect-card {
    width: 100%;
    max-width: 1080px;
    gap: 0;
  }
  .account-chooser .account-header {
    border-bottom: 1px solid var(--line);
    padding-bottom: 18px;
  }
  .accounts-title {
    margin: 34px 0 18px;
  }
  .account-chooser .account-list {
    grid-template-columns: repeat(auto-fill, minmax(184px, 1fr));
    gap: 14px;
  }
  .account-chooser .saved-account,
  .account-chooser .add-account {
    aspect-ratio: auto;
    min-height: 136px;
  }
  .account-chooser .account-login {
    padding: 16px;
  }
}
</style>
