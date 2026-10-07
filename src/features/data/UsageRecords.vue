<script setup lang="ts">
// The usage records, a card of the data panel: how many streaming-speed samples are kept, against
// a limit past which the closest ones merge, and what deleted sessions left, which the statistics
// count until it is cleared here.
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import * as api from '../../core/api/endpoints.ts';
import type { StorageSnapshot } from '../../core/api/types.ts';
import { errorText } from '../../core/errors.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { toast } from '../../ui/toast.ts';
// The switch's look.
import '../settings/settings.css';

const props = defineProps<{ storage: StorageSnapshot }>();
const emit = defineEmits<{ changed: [] }>();
const number = (value: number) => new Intl.NumberFormat(i18n.locale.value).format(value);

const samples = computed(() => props.storage.stream_samples);
const leftover = computed(() => props.storage.leftover_usage);
const hasLeftover = computed(() => leftover.value.calls > 0 || leftover.value.stream_samples > 0);

const LEAST = 100;
const editing = ref(false);
const limited = ref(true);
const limit = ref(20_000);
const saving = ref(false);
const failed = ref('');
function editLimit() {
  limited.value = samples.value.limit != null;
  limit.value = samples.value.limit ?? 20_000;
  failed.value = '';
  editing.value = true;
}
const limitValid = computed(() => !limited.value || (Number.isInteger(limit.value) && limit.value >= LEAST));
async function saveLimit() {
  saving.value = true;
  failed.value = '';
  try {
    const snapshot = await api.configSnapshot();
    snapshot.config.usage = { ...snapshot.config.usage, stream_sample_limit: limited.value ? limit.value : null };
    await api.configSave(snapshot);
    editing.value = false;
    toast(tr('已保存采样点上限', 'Sample limit saved'));
    emit('changed');
  } catch (error) {
    failed.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

const clearing = ref(false);
const pruning = ref(false);
async function clearLeftover() {
  pruning.value = true;
  failed.value = '';
  try {
    const result = await api.storagePruneUsage();
    clearing.value = false;
    toast(tr(`已清除，释放了 ${fmtBytes(Math.max(0, result.database.before - result.database.after))}`,
      `Cleared, ${fmtBytes(Math.max(0, result.database.before - result.database.after))} freed`));
    emit('changed');
  } catch (error) {
    failed.value = errorText(error);
  } finally {
    pruning.value = false;
  }
}
</script>

<template>
  <section class="usage-records">
    <header class="usage-records-head">
      <h2>{{ tr('用量记录', 'Usage records') }}</h2>
      <p>{{ tr('每次模型调用的 Token 用量和速度采样点，统计页的数字都来自这里', 'Each model call\'s tokens and speed samples, which the statistics are made of') }}</p>
    </header>
    <div class="usage-records-grid">
      <div class="usage-record">
        <div class="usage-record-head">
          <span>{{ tr('速度采样点', 'Speed samples') }}</span>
          <button type="button" class="btn sm" @click="editLimit">{{ tr('设置上限', 'Set limit') }}</button>
        </div>
        <strong class="usage-record-figure">{{ number(samples.count) }}<small>{{ samples.limit == null ? tr(' 个，不限数量', ', no limit') : tr(` / ${number(samples.limit)} 个`, ` of ${number(samples.limit)}`) }}</small></strong>
        <span v-if="samples.limit != null" class="usage-record-meter" role="meter" :aria-valuenow="samples.count" aria-valuemin="0" :aria-valuemax="samples.limit">
          <i :style="{ width: `${Math.min(100, samples.count / samples.limit * 100)}%` }" />
        </span>
      </div>
      <div class="usage-record">
        <div class="usage-record-head">
          <span>{{ tr('已删除会话的记录', 'Records of deleted sessions') }}</span>
          <button v-if="hasLeftover" type="button" class="btn sm danger" @click="failed = ''; clearing = true">{{ tr('清除', 'Clear') }}</button>
        </div>
        <template v-if="hasLeftover">
          <strong class="usage-record-figure">{{ number(leftover.calls) }}<small>{{ tr(' 次调用 · ', ' calls · ') }}</small>{{ number(leftover.stream_samples) }}<small>{{ tr(' 个采样点', ' samples') }}</small></strong>
          <small class="usage-record-note">{{ tr('仍计入统计，清除后不再计入', 'Still counted, until cleared') }}</small>
        </template>
        <template v-else>
          <strong class="usage-record-figure">0</strong>
          <small class="usage-record-note">{{ tr('没有遗留记录', 'Nothing left behind') }}</small>
        </template>
      </div>
    </div>

  <Modal compact :open="editing" :dismissable="!saving" :title="tr('速度采样点上限', 'Speed sample limit')" @close="editing = false">
    <div class="usage-records-dialog">
      <p>{{ tr('超过上限时，把相邻、合并后覆盖时间最短的采样点合并成一个，直到降到上限的九成。合并后的点把输出和流式时长相加，所以总量和平均速度不变，只是细节变粗。',
        'Past the limit, neighbouring samples merge, those that would span the least time first, until nine-tenths of it remain. A merged sample adds up the output and streaming time of both, so totals and average speeds stay as they were and only the detail coarsens.') }}</p>
      <label class="usage-records-row">
        <span>{{ tr('限制数量', 'Limit the number') }}</span>
        <SwitchRoot v-model="limited" class="cfg-switch" :disabled="saving"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot>
      </label>
      <label v-if="limited" class="usage-records-row">
        <span>{{ tr('最多保留', 'Keep at most') }}</span>
        <input v-model.number="limit" class="input" type="number" :min="LEAST" step="1000" inputmode="numeric" :disabled="saving" />
      </label>
      <p v-if="limited && !limitValid" class="usage-records-error">{{ tr(`至少 ${LEAST} 个。`, `At least ${LEAST}.`) }}</p>
      <p v-if="failed" class="usage-records-error" role="alert">{{ failed }}</p>
    </div>
    <template #footer>
      <button class="btn ghost" :disabled="saving" @click="editing = false">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn primary" :disabled="saving || !limitValid" @click="saveLimit"><Icon v-if="saving" name="loader-circle" class="spin" />{{ tr('保存', 'Save') }}</button>
    </template>
  </Modal>

  <Modal compact :open="clearing" :dismissable="!pruning" :title="tr('清除已删除会话的用量记录', 'Clear usage of deleted sessions')" @close="clearing = false">
    <div class="usage-records-dialog">
      <p>{{ tr(`将删除 ${number(leftover.calls)} 次调用的 Token 记录和 ${number(leftover.stream_samples)} 个速度采样点。现有会话的用量不受影响；清除后，用量统计不再包含这些已删除的会话。`,
        `Deletes the token records of ${number(leftover.calls)} calls and ${number(leftover.stream_samples)} speed samples. Existing sessions keep their usage; afterwards the statistics no longer include these deleted sessions.`) }}</p>
      <p class="usage-records-note">{{ tr('清除后无法恢复。', 'This cannot be undone.') }}</p>
      <p v-if="failed" class="usage-records-error" role="alert">{{ failed }}</p>
    </div>
    <template #footer>
      <button class="btn ghost" :disabled="pruning" @click="clearing = false">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn danger solid" :disabled="pruning" @click="clearLeftover"><Icon v-if="pruning" name="loader-circle" class="spin" />{{ tr('清除', 'Clear') }}</button>
    </template>
  </Modal>
  </section>
</template>

<style scoped>
.usage-records { min-width: 0; padding: 16px 18px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
@media (max-width: 899px) { .usage-records { border: 0; border-radius: 18px; background: var(--bg-group); } }
.usage-records-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; }
.usage-records-head h2 { margin: 0; font: 600 14px/1.5 var(--font); }
.usage-records-head p { margin: 0; color: var(--fg-subtle); font-size: 12.5px; }
/* Two cells alike: a name with its action, a figure, and a line under it. */
.usage-records-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
.usage-record { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.usage-record + .usage-record { padding-left: 20px; margin-left: 20px; border-left: 1px solid var(--line); }
.usage-record-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; color: var(--fg-muted); font-size: 13px; }
.usage-record-head .btn { flex: none; }
.usage-record-figure { font-size: 20px; font-weight: 600; line-height: 1.3; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.usage-record-figure small { color: var(--fg-subtle); font-size: 13px; font-weight: 400; letter-spacing: 0; }
.usage-record-note { color: var(--fg-subtle); font-size: 12px; }
.usage-record-meter { display: block; height: 4px; margin-top: 4px; border-radius: 999px; background: var(--bg-sunken); overflow: hidden; }
.usage-record-meter i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
@media (max-width: 699px) {
  .usage-records-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .usage-record + .usage-record { padding: 16px 0 0; margin: 0; border-left: 0; border-top: 1px solid var(--line); }
}
.usage-records-dialog { display: grid; gap: 14px; }
.usage-records-dialog p { margin: 0; color: var(--fg-muted); font-size: 13px; line-height: 1.6; }
.usage-records-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--fg); font-size: 13.5px; }
.usage-records-row .input { width: 14ch; text-align: right; font-variant-numeric: tabular-nums; }
.usage-records-dialog .usage-records-note { color: var(--fg-subtle); font-size: 12.5px; }
.usage-records-dialog .usage-records-error { color: var(--danger); font-size: 12.5px; }
</style>
