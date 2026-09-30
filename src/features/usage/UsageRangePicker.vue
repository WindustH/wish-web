<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import Modal from '../../ui/components/Modal.vue';
import { localDate, type RangeSelection, type TotalsRange } from '../../core/usage/windows.ts';
import { tr } from '../../core/i18n/tr.ts';
// `allowAll` adds an all-time choice for totals; charts always need a window.
const props = defineProps<{ modelValue: RangeSelection | TotalsRange; allowAll?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();
const open = ref(false), start = ref(''), end = ref('');
const today = () => localDate();
const earliest = () => { const d = new Date(); d.setDate(d.getDate()-399); return localDate(d); };
const options = computed(() => [
  ...(props.allowAll ? [{value:'all',label:tr('全部','All time')}] : []),
  {value:'day',label:tr('一天','Day')}, {value:'week',label:tr('一周','Week')},
  {value:'month',label:tr('一个月','Month')}, {value:'quarter',label:tr('三个月','Three months')},
  {value:'year',label:tr('一年','Year')},
  {value:'custom',label:props.modelValue.period === 'custom' ? `${(props.modelValue as RangeSelection).start} – ${(props.modelValue as RangeSelection).end}` : tr('自定义日期…','Custom dates…')},
]);
const valid = computed(() => start.value >= earliest() && end.value <= today() && start.value <= end.value && (Date.parse(end.value)-Date.parse(start.value))/86_400_000 < 366);
function select(value: string) {
  if(value !== 'custom') { emit('update:modelValue',{period:value as RangeSelection['period']}); return; }
  const d = new Date(); d.setDate(d.getDate()-6);
  const current = props.modelValue as RangeSelection;
  start.value = current.start ?? localDate(d);
  end.value = current.end ?? today();
  open.value = true;
}
function apply() { if(valid.value) { emit('update:modelValue',{period:'custom',start:start.value,end:end.value}); open.value=false; } }
</script>
<template>
  <div class="usage-range-picker">
    <SelectField :model-value="modelValue.period" :options="options" :aria-label="tr('时间范围','Time range')" @update:model-value="select" />
    <button v-if="modelValue.period==='custom'" class="btn ghost sm" :aria-label="tr('修改日期范围','Edit date range')" @click="select('custom')">{{ tr('修改','Edit') }}</button>
  </div>
  <Modal compact content-class="date-range-dialog" :open="open" :title="tr('自定义日期范围','Custom date range')" @close="open=false">
    <form id="usage-date-form" class="usage-date-form" @submit.prevent="apply">
      <label>{{ tr('开始日期','Start date') }}<input v-model="start" class="input" type="date" required :min="earliest()" :max="end || today()" /></label>
      <label>{{ tr('结束日期','End date') }}<input v-model="end" class="input" type="date" required :min="start || earliest()" :max="today()" /></label>
      <p class="hint">{{ tr('包含开始和结束日期，最多选择 366 天。','Includes both dates, up to 366 days.') }}</p>

    </form>
    <template #footer><button class="btn ghost" @click="open=false">{{tr('取消','Cancel')}}</button><button class="btn primary" type="submit" form="usage-date-form" :disabled="!valid">{{tr('应用','Apply')}}</button></template>
  </Modal>
</template>
<style scoped>
.usage-range-picker { display:flex; align-items:center; gap:4px; min-width:0; max-width:100%; }
.usage-range-picker :deep(.control-select) { width: auto; max-width: min(260px, 100%); min-width: 0; min-height: 32px; padding: 4px 10px; font-size:12px; }
.usage-range-picker :deep(.control-select) { flex: 1; }
.usage-date-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 12px; margin-top:12px; }
.usage-date-form .hint { grid-column:1/-1; margin:0; font-size:12px; color:var(--fg-subtle); }
.usage-date-form input { width:100%; min-width:0; }
@media(max-width:359px){.usage-date-form { grid-template-columns:minmax(0,1fr); }}
.usage-date-form label { display:grid; gap:6px; }
.usage-date-form .btn { justify-self:end; }
</style>
