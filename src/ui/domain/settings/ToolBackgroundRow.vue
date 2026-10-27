<script setup lang="ts">
import SwitchRow from './SwitchRow.vue';
import { tr } from '../../../core/i18n/tr.ts';
defineProps<{ disabled?: boolean }>();
const enabled = defineModel<boolean>({ required: true });
</script>
<template>
  <SwitchRow
    v-model="enabled"
    :disabled="disabled"
    :name="tr('有新消息时将工具转入后台', 'Background tools for new messages')"
    :hint="
      tr(
        '有待处理消息时，让正在执行的工具在后台继续，模型先读取消息。关闭后等待当前工具批次完成；已转入后台的任务不受影响。',
        'When input is waiting, let running tools continue in the background so the model can respond. When off, wait for the current tool batch. Already-backgrounded work is unaffected.',
      )
    "
  />
</template>
