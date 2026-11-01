<script setup lang="ts">
import { ref, watch } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import ProviderIcon from '../providers/ProviderIcon.vue';
import { tr } from '../../core/i18n/tr.ts';

export interface AccountServiceOption {
  key: string;
  title: string;
  category: string;
  detail?: string;
  brand?: string;
}
const props = defineProps<{ open: boolean; accountName: string; options: AccountServiceOption[] }>();
const emit = defineEmits<{ close: []; confirm: [keys: string[]] }>();
const selected = ref<string[]>([]);
watch(
  () => props.open,
  (open) => {
    if (open) selected.value = props.options.map((option) => option.key);
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="open"
    compact
    :layer="110"
    :title="tr('添加账户服务？', 'Add account services?')"
    @close="emit('close')"
  >
    <div class="account-services-dialog">
      <p class="intro">
        {{ tr('为', 'Configure services for') }} <strong>{{ accountName }}</strong
        >{{ tr('添加以下服务配置？', '?') }}
      </p>
      <p class="hint">
        {{
          tr(
            '根据账户类型推荐，实际可用范围取决于账户权限。可选择需要的服务，稍后仍可调整。',
            'Suggested for this account type; availability depends on account access. Choose the services you need and adjust them later.',
          )
        }}
      </p>
      <div class="service-options">
        <label v-for="option in options" :key="option.key" class="service-option">
          <input v-model="selected" type="checkbox" :value="option.key" />
          <ProviderIcon :brand="option.brand" fallback="key" />
          <span class="service-copy"
            ><strong>{{ option.title }}</strong
            ><span
              >{{ option.category }}<template v-if="option.detail"> · {{ option.detail }}</template></span
            ></span
          >
        </label>
      </div>
      <p class="hint">
        {{
          tr(
            '将加入待保存配置，并关联此账户。现有服务和默认模型保持不变。',
            'Adds services to your pending configuration and links this account. Existing services and the default model stay unchanged.',
          )
        }}
      </p>
    </div>
    <template #footer>
      <button class="btn ghost" @click="emit('close')">{{ tr('暂不添加', 'Not now') }}</button>
      <button
        class="btn primary"
        :disabled="!selected.length"
        @click="
          emit(
            'confirm',
            selected.filter((key) => options.some((option) => option.key === key)),
          )
        "
      >
        {{ tr('添加所选服务', 'Add selected services') }}<span v-if="selected.length"> · {{ selected.length }}</span>
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.account-services-dialog {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.intro,
.hint {
  margin: 0;
  line-height: 1.6;
}
.hint {
  color: var(--fg-muted);
  font-size: 12px;
}
.service-options {
  display: grid;
  gap: 6px;
  max-height: min(42vh, 360px);
  overflow: auto;
}
.service-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
}
.service-option:has(input:checked) {
  border-color: var(--accent);
  background: var(--bg-raised);
}
.service-option input {
  flex: none;
  accent-color: var(--accent);
}
.service-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.service-copy strong {
  font-size: 13px;
  font-weight: 500;
}
.service-copy > span {
  font-size: 12px;
  color: var(--fg-muted);
}
</style>
