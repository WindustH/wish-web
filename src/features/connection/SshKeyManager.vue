<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { errorText } from '../../core/errors.ts';
import { isNativeApp } from '../../platform/native.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { copyText } from '../../ui/clipboard.ts';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { deleteKey, generateKey, keyUsers, listKeys, type BrowserKey } from './sshKeys.ts';

const props = defineProps<{ keys: BrowserKey[]; selectedId: string }>();
const emit = defineEmits<{ changed: [keys: BrowserKey[]]; select: [id: string]; close: [] }>();
const mobile = useIsMobile();
const creating = ref(false);
const generated = shallowRef<BrowserKey>();
const removing = shallowRef<BrowserKey>();
const name = ref('');
const busy = ref(false);
const error = ref('');
const copied = ref('');
const revision = ref(0);
const rows = computed(() => {
  void revision.value;
  return props.keys.map((key) => ({ key, users: keyUsers(key.id) }));
});
function accountsChanged() {
  revision.value++;
}
onMounted(async () => {
  window.addEventListener('storage', accountsChanged);
  try {
    emit('changed', await listKeys());
  } catch (e) {
    error.value = errorText(e);
  }
});
onBeforeUnmount(() => window.removeEventListener('storage', accountsChanged));
function openCreate() {
  name.value = error.value = copied.value = '';
  generated.value = undefined;
  creating.value = true;
}
async function create() {
  if (busy.value || generated.value || !name.value.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    const key = await generateKey(name.value.trim(), isNativeApp());
    emit('changed', [...props.keys, key]);
    emit('select', key.id);
    generated.value = key;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (!removing.value || busy.value) return;
  busy.value = true;
  try {
    const id = removing.value.id;
    await deleteKey(id, props.selectedId);
    emit(
      'changed',
      props.keys.filter((key) => key.id !== id),
    );
  } catch (e) {
    error.value = errorText(e);
    accountsChanged();
  } finally {
    busy.value = false;
    removing.value = undefined;
  }
}
async function copy(key: BrowserKey) {
  if (await copyText(key.publicKey)) copied.value = key.id;
}
</script>
<template>
  <Modal
    :open="true"
    :page="mobile"
    :layer="80"
    :title="tr('SSH 密钥', 'SSH keys')"
    content-class="ssh-key-manager"
    @close="emit('close')"
  >
    <div class="set-card" v-if="rows.length">
      <div class="key-row" v-for="{ key, users } in rows" :key="key.id">
        <Icon name="key" :size="18" />
        <div class="key-info">
          <strong>{{ key.name }}</strong>
          <small>{{
            users.length
              ? tr('用于 ', 'Used by ') + users.join('、')
              : selectedId === key.id
                ? tr('当前已选用', 'Selected for this login')
                : tr('未被账户使用', 'Unused')
          }}</small>
        </div>
        <button
          class="btn ghost icon-only"
          type="button"
          :aria-label="tr('复制公钥', 'Copy public key') + ' · ' + key.name"
          @click="copy(key)"
        >
          <Icon :name="copied === key.id ? 'check' : 'copy'" />
        </button>
        <button
          class="btn ghost icon-only delete-key"
          type="button"
          :aria-label="tr('删除密钥', 'Delete key') + ' · ' + key.name"
          :disabled="!!users.length || key.id === selectedId"
          @click="
            removing = key;
            error = '';
          "
        >
          <Icon name="trash-2" />
        </button>
      </div>
    </div>
    <p v-else class="hint">{{ tr('此设备还没有保存 SSH 密钥。', 'There are no SSH keys saved on this device.') }}</p>
    <p v-if="error && !creating" class="connect-error" role="alert">{{ error }}</p>
    <template #footer
      ><button type="button" class="btn primary create-key" @click="openCreate">
        <Icon name="plus" />{{ tr('生成密钥', 'Generate key') }}
      </button></template
    >
    <Modal
      v-if="creating"
      :open="true"
      compact
      :page="mobile"
      :dismissable="!busy"
      :layer="90"
      :title="generated ? tr('密钥已生成', 'Key generated') : tr('生成 SSH 密钥', 'Generate SSH key')"
      content-class="ssh-key-create"
      @close="
        creating = false;
        error = '';
      "
    >
      <template v-if="generated">
        <label class="public-key-label" for="generated-public-key"
          >{{ generated.name }} · {{ tr('公钥', 'Public key') }}</label
        >
        <textarea
          class="input public-key"
          id="generated-public-key"
          readonly
          spellcheck="false"
          :value="generated.publicKey"
        />
        <p class="hint">
          {{
            tr(
              '将此公钥加入 Wish 后端的 SSH 公钥白名单，即可用这把密钥登录。',
              'Add this public key to the Wish backend’s authorized keys to use it for login.',
            )
          }}
        </p>
      </template>
      <form v-else id="generate-ssh-key" @submit.prevent="create">
        <label class="field" for="ssh-key-name"
          ><span>{{ tr('密钥名称', 'Key name') }}</span
          ><input
            class="input"
            id="ssh-key-name"
            v-model="name"
            required
            maxlength="64"
            :disabled="busy"
            :placeholder="tr('例如：工作手机', 'e.g. Work phone')"
        /></label>
        <p class="hint">
          {{
            tr(
              '私钥保存在此设备上。生成后可复制公钥。',
              'The private key stays on this device. You can copy the public key after generation.',
            )
          }}
        </p>
      </form>
      <p v-if="error" class="connect-error" role="alert">{{ error }}</p>
      <template #footer>
        <template v-if="generated">
          <button type="button" class="btn" @click="copy(generated)">
            <Icon :name="copied === generated.id ? 'check' : 'copy'" />{{
              copied === generated.id ? tr('已复制', 'Copied') : tr('复制公钥', 'Copy public key')
            }}
          </button>
          <button type="button" class="btn primary finish-key" @click="emit('close')">{{ tr('完成', 'Done') }}</button>
        </template>
        <template v-else
          ><button
            type="button"
            class="btn ghost"
            :disabled="busy"
            @click="
              creating = false;
              error = '';
            "
          >
            {{ tr('取消', 'Cancel') }}</button
          ><button type="submit" form="generate-ssh-key" class="btn primary" :disabled="busy || !name.trim()">
            {{ tr('生成', 'Generate') }}
          </button></template
        >
      </template>
    </Modal>
    <Modal
      v-if="removing"
      :open="true"
      compact
      :layer="90"
      :dismissable="!busy"
      :title="tr('删除密钥？', 'Delete key?')"
      @close="removing = undefined"
    >
      <p>
        {{
          tr(
            '将从此设备永久删除「' + removing.name + '」的私钥。',
            'Permanently remove the private key for ' + removing.name + ' from this device.',
          )
        }}
      </p>
      <template #footer
        ><button class="btn ghost" type="button" :disabled="busy" @click="removing = undefined">
          {{ tr('取消', 'Cancel') }}</button
        ><button class="btn danger" type="button" :disabled="busy" @click="remove">
          {{ tr('删除', 'Delete') }}
        </button></template
      >
    </Modal>
  </Modal>
</template>
<style scoped>
.key-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  min-height: 58px;
}
.key-row + .key-row {
  border-top: 1px solid var(--line);
}
.key-row > .icon,
.key-info small {
  color: var(--fg-subtle);
}
.key-info {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
  overflow-wrap: anywhere;
}
.key-info strong,
.public-key-label {
  font-size: 14px;
  font-weight: 500;
}
.key-info small {
  font-size: 12px;
}
.key-row button:disabled {
  opacity: 0.35;
}
.public-key {
  width: 100%;
  display: block;
  min-height: 5em;
  font-size: 13px;
  margin-top: 8px;
  resize: vertical;
}
</style>
