<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import Modal from '../../ui/components/Modal.vue';
import { i18n } from '../../core/i18n/index.js';
import { localDate, type RangeSelection } from '../../core/usage/windows';
const props = defineProps<{ modelValue: RangeSelection }>();
const emit = defineEmits<{ 'update:modelValue': [value: RangeSelection] }>();
const tx = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const open = ref(false), start = ref(''), end = ref('');
const today = () => localDate();
const earliest = () => { const d = new Date(); d.setDate(d.getDate()-399); return localDate(d); };
const options = computed(() => [
  {value:'day',label:tx('一天','Day')}, {value:'week',label:tx('一周','Week')},
  {value:'month',label:tx('一个月','Month')}, {value:'quarter',label:tx('三个月','Three months')},
  {value:'year',label:tx('一年','Year')},
  {value:'custom',label:props.modelValue.period === 'custom' ? `${props.modelValue.start} – ${props.modelValue.end}` : tx('自定义日期…','Custom dates…')},
]);
const valid = computed(() => start.value >= earliest() && end.value <= today() && start.value <= end.value && (Date.parse(end.value)-Date.parse(start.value))/86_400_000 < 366);
function select(value: string) {
  if(value !== 'custom') { emit('update:modelValue',{period:value as RangeSelection['period']}); return; }
  const d = new Date(); d.setDate(d.getDate()-6);
  start.value = props.modelValue.start ?? localDate(d);
  end.value = props.modelValue.end ?? today();
  open.value = true;
}
function apply() { if(valid.value) { emit('update:modelValue',{period:'custom',start:start.value,end:end.value}); open.value=false; } }
</script>
<template>
  <div class="usage-range-picker">
    <SelectField :model-value="modelValue.period" :options="options" :aria-label="tx('时间范围','Time range')" @update:model-value="select" />
    <button v-if="modelValue.period==='custom'" class="btn ghost sm" :aria-label="tx('修改日期范围','Edit date range')" @click="select('custom')">{{ tx('修改','Edit') }}</button>
  </div>
  <Modal :open="open" :title="tx('自定义日期范围','Custom date range')" @close="open=false">
    <form class="usage-date-form" @submit.prevent="apply">
      <label>{{ tx('开始日期','Start date') }}<input v-model="start" class="input" type="date" required :min="earliest()" :max="end || today()" /></label>
      <label>{{ tx('结束日期','End date') }}<input v-model="end" class="input" type="date" required :min="start || earliest()" :max="today()" /></label>
      <p class="hint">{{ tx('包含开始和结束日期，最多选择 366 天。','Includes both dates, up to 366 days.') }}</p>
      <button class="btn primary" type="submit" :disabled="!valid">{{ tx('应用','Apply') }}</button>
    </form>
  </Modal>
</template>
<style scoped>
.usage-range-picker { display:flex; align-items:center; gap:4px; max-width:100%; }
.usage-range-picker :deep(.control-select) { width: auto; max-width: 260px; min-width: 100px; min-height: 32px; padding: 4px 10px; font-size:12px; }
.usage-date-form { display:grid; gap:16px; }
.usage-date-form label { display:grid; gap:6px; }
.usage-date-form .btn { justify-self:end; }
</style>
