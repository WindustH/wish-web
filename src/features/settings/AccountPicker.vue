<script setup lang="ts">
import { computed, inject, ref, onMounted } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import SelectField from '../../ui/domain/providers/SelectField.vue';
import AccountEditor from './AccountEditor.vue';
import { configDraftKey } from './useConfigDraft.ts';
import { presetBrand } from '../../ui/domain/providers/providerPresentation.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { compatibleAccounts, defaultAccount } from './accountCompatibility.ts';
import { useAccountCatalog } from './useAccountCatalog.ts';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{
  modelValue?: string | null;
  preset?: string;
  creationPreset?: string;
  allowed?: string[];
  required?: boolean;
  requiredCredentials?: string[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();
const { draft } = inject(configDraftKey)!;
const editing = ref('');
const accountCatalog = useAccountCatalog();
const options = computed(() =>
  compatibleAccounts(draft.value.accounts ?? {}, props.allowed ?? (props.preset ? [props.preset] : undefined)).map(
    ([id, a]) => ({
      value: id,
      label: a.name || id,
      brand: accountCatalog.value.find((p) => p.id === a.preset)?.brand || presetBrand(a.preset || ''),
    }),
  ),
);
onMounted(() => {
  if (props.modelValue === '' && props.required && (props.allowed || props.preset)) {
    const id = defaultAccount(
      draft.value.accounts ?? {},
      props.allowed ?? (props.preset ? [props.preset] : undefined),
      props.requiredCredentials,
    );
    if (id) emit('update:modelValue', id);
  }
});
function add() {
  draft.value.accounts ??= {};
  const preset = props.creationPreset || props.preset;
  const id = uniqueId(preset || 'account', (id) => id in draft.value.accounts);
  draft.value.accounts[id] = {
    name: accountCatalog.value.find((p) => p.id === preset)?.name || preset || tr('新账户', 'New account'),
    preset: preset || 'custom',
    credentials: {},
    credentials_env: {},
    proxy_enabled: true,
  };
  emit('update:modelValue', id);
  editing.value = id;
}
</script>
<template>
  <div class="account-picker">
    <SelectField
      :model-value="modelValue || ''"
      :placeholder="options.length ? tr('选择账户', 'Select account') : tr('暂无可用账户', 'No accounts available')"
      :options="options"
      :aria-label="tr('账户', 'Account')"
      @update:model-value="emit('update:modelValue', $event)"
    /><button class="btn sm" @click="add">{{ tr('新增账户', 'New account') }}</button
    ><Hint v-if="modelValue" :text="tr('编辑账户', 'Edit account')"
      ><button class="btn ghost icon-only" :aria-label="tr('编辑账户', 'Edit account')" @click="editing = modelValue!">
        <Icon name="pencil" /></button></Hint
    ><Hint v-if="modelValue && !required" :text="tr('解除关联', 'Unlink account')"
      ><button
        class="btn ghost icon-only"
        :aria-label="tr('解除关联', 'Unlink account')"
        @click="emit('update:modelValue', null)"
      >
        <Icon name="x" /></button
    ></Hint>
  </div>
  <AccountEditor v-if="editing" :id="editing" @close="editing = ''" />
</template>
<style scoped>
.account-picker {
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.account-picker :deep(.control-select) {
  flex: 1 1 140px;
  min-width: 0;
  max-width: 100%;
}
.btn {
  flex: none;
}
</style>
