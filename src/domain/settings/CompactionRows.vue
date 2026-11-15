<script setup lang="ts">
// The three numbers compaction runs by, a row each: its label and value -
// beside the field, with `showCompact`, the value in compact form (235929 reads "23.6万").
import { tr } from '../../core/i18n/tr.ts';
import { compactPositive } from '../../core/util/fmt.ts';

defineProps<{ value: Record<string, any>; inline?: boolean; showCompact?: boolean }>();
const fields = () => [
  {
    key: 'trigger_tokens',
    label: tr('触发压缩的 Token 数', 'Compaction trigger tokens'),
  },
  {
    key: 'target_tokens',
    label: tr('压缩后的目标 Token 数', 'Target tokens after compaction'),
  },
  {
    key: 'segment_tokens',
    label: tr('触发分段摘要的 Token 阈值', 'Segment summary token threshold'),
  },
];
</script>

<template>
  <label v-for="field in fields()" :key="field.key" class="set-row" :class="{ inline }"
    ><span class="set-label"
      ><span>{{ field.label }}</span></span
    ><span class="set-number"
      ><em v-if="showCompact">{{ compactPositive(value[field.key]) }}</em
      ><input class="input" type="number" min="1" inputmode="numeric" v-model.number="value[field.key]" /></span
  ></label>
</template>
