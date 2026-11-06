<script setup lang="ts">
import { ref } from 'vue';
import AccountServicesDialog from '../../domain/settings/AccountServicesDialog.vue';
import type { AccountServiceOption } from '../../domain/settings/accountServiceTypes.ts';
import { tr } from '../../core/i18n/tr.ts';
const open = ref(false);
const result = ref('');
const options: AccountServiceOption[] = [
  { key: 'models', title: 'Example Cloud', brand: 'OpenAI', category: tr('模型', 'Models'), detail: 'API' },
  { key: 'search', title: tr('网页搜索', 'Web search'), category: tr('搜索', 'Search') },
  { key: 'fetch', title: tr('网页读取', 'Web fetch'), category: tr('网页读取', 'Web fetch') },
  { key: 'images', title: tr('图片服务', 'Image service'), category: tr('图片生成', 'Image generation') },
  { key: 'audio', title: tr('语音服务', 'Speech service'), category: tr('音频生成', 'Audio generation') },
];
function confirm(keys: string[]) {
  result.value = tr(
    `预览：选择了 ${keys.length} 项服务，未修改配置。`,
    `Preview: ${keys.length} services selected. No configuration was changed.`,
  );
  open.value = false;
}
</script>
<template>
  <button class="btn" @click="open = true">{{ tr('打开账户服务弹窗', 'Open account services dialog') }}</button>
  <p v-if="result" role="status">{{ result }}</p>
  <AccountServicesDialog
    :open="open"
    :account-name="tr('我的新账户（样例）', 'My new account (sample)')"
    :options="options"
    @close="open = false"
    @confirm="confirm"
  />
</template>
