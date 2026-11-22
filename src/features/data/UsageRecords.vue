<script setup lang="ts">
// The usage records, a card of the data panel: how many streaming-speed samples are kept, against
// a limit past which the closest ones merge, and what deleted sessions left, which the statistics
// count until it is cleared here.
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import * as api from '../../core/api/endpoints.ts';
import type { StorageSnapshot } from '../../core/api/types.ts';
import { errorText } from '../../core/errors.ts';
import { saveConfigEdits } from '../../core/configEdits.ts';
import { bus } from '../../core/bus.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { toast } from '../../ui/toast.ts';
// The switch's look.
import '../../domain/settings/settings.css';

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
    const config = {
      ...snapshot.config,
      usage: { ...snapshot.config.usage, stream_sample_limit: limited.value ? limit.value : null },
    };
    await saveConfigEdits(snapshot, config);
    bus.emit('configuration.changed', {});
    editing.value = false;
    toast(tr('已保存采样点上限', 'Sample limit saved'));
    emit('changed');
  } catch (error) {
    failed.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

const archive = ref(false);
const clearing = ref(false);
const pruning = ref(false);
async function clearLeftover() {
  pruning.value = true;
  failed.value = '';
  try {
    const result = await api.storagePruneUsage(undefined, archive.value);
    if (result.archive) bus.emit('archives.changed');
    clearing.value = false;
    const size = fmtBytes(Math.max(0, result.database.before - result.database.after));
    toast(
      result.archive
        ? tr(`已归档并清除用量记录，释放了 ${size}`, `Usage records archived and cleared, ${size} freed`)
        : tr(`已清除，释放了 ${size}`, `Cleared, ${size} freed`),
    );
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
    <div v-if="hasLeftover" class="usage-record">
      <span
        >{{ tr('已删会话遗留', 'Deleted sessions') }}
        <b
          >{{ tr(number(leftover.calls) + ' 次调用', number(leftover.calls) + ' calls')
          }}<template v-if="leftover.stream_samples">
            ·
            {{
              tr(number(leftover.stream_samples) + ' 个采样点', number(leftover.stream_samples) + ' samples')
            }}</template
          ></b
        ></span
      >
      <button
        class="btn ghost sm"
        @click="
          failed = '';
          archive = false;
          clearing = true;
        "
      >
        {{ tr('清除', 'Clear') }}
      </button>
    </div>
    <div class="usage-record">
      <span
        >{{ tr('速度采样点', 'Speed samples') }}
        <b>{{ number(samples.count) }} / {{ samples.limit == null ? '∞' : number(samples.limit) }}</b></span
      >
      <button class="btn ghost sm" @click="editLimit">{{ tr('设置上限', 'Set limit') }}</button>
    </div>
    <Modal
      compact
      :open="editing"
      :dismissable="!saving"
      :title="tr('速度采样点上限', 'Speed sample limit')"
      @close="editing = false"
    >
      <div class="usage-records-dialog">
        <p>
          {{
            tr(
              '超过上限时，把相邻、合并后覆盖时间最短的采样点合并成一个，直到降到上限的九成。合并后的点把输出和流式时长相加，所以总量和平均速度不变，只是细节变粗。',
              'Past the limit, neighbouring samples merge, those that would span the least time first, until nine-tenths of it remain. A merged sample adds up the output and streaming time of both, so totals and average speeds stay as they were and only the detail coarsens.',
            )
          }}
        </p>
        <label class="usage-records-row">
          <span>{{ tr('限制数量', 'Limit the number') }}</span>
          <SwitchRoot v-model="limited" class="cfg-switch" :disabled="saving"
            ><SwitchThumb class="cfg-switch-thumb"
          /></SwitchRoot>
        </label>
        <label v-if="limited" class="usage-records-row">
          <span>{{ tr('最多保留', 'Keep at most') }}</span>
          <input
            v-model.number="limit"
            class="input"
            type="number"
            :min="LEAST"
            step="1000"
            inputmode="numeric"
            :disabled="saving"
          />
        </label>
        <p v-if="limited && !limitValid" class="usage-records-error">
          {{ tr(`至少 ${LEAST} 个。`, `At least ${LEAST}.`) }}
        </p>
        <p v-if="failed" class="usage-records-error" role="alert">{{ failed }}</p>
      </div>
      <template #footer>
        <button class="btn ghost" :disabled="saving" @click="editing = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn primary" :disabled="saving || !limitValid" @click="saveLimit">
          <Icon v-if="saving" name="loader-circle" class="spin" />{{ tr('保存', 'Save') }}
        </button>
      </template>
    </Modal>

    <Modal
      compact
      :open="clearing"
      :dismissable="!pruning"
      :title="tr('清除已删除会话的用量记录', 'Clear usage of deleted sessions')"
      @close="clearing = false"
    >
      <div class="usage-records-dialog">
        <p>
          {{
            tr(
              `将删除 ${number(leftover.calls)} 次调用的 Token 记录和 ${number(leftover.stream_samples)} 个速度采样点。现有会话的用量不受影响；清除后，用量统计不再包含这些已删除的会话。`,
              `Deletes the token records of ${number(leftover.calls)} calls and ${number(leftover.stream_samples)} speed samples. Existing sessions keep their usage; afterwards the statistics no longer include these deleted sessions.`,
            )
          }}
        </p>
        <label class="usage-records-row"
          ><span>{{ tr('清除前归档用量记录', 'Archive usage records before clearing') }}</span
          ><SwitchRoot v-model="archive" class="cfg-switch" :disabled="pruning"
            ><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot
        ></label>
        <p v-if="!archive" class="usage-records-note">{{ tr('清除后无法恢复。', 'This cannot be undone.') }}</p>
        <p v-if="failed" class="usage-records-error" role="alert">{{ failed }}</p>
      </div>
      <template #footer>
        <button class="btn ghost" :disabled="pruning" @click="clearing = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn" :class="archive ? 'primary' : 'danger solid'" :disabled="pruning" @click="clearLeftover">
          <Icon v-if="pruning" name="loader-circle" class="spin" /><Icon v-else-if="archive" name="archive" />
          {{ archive ? tr('归档并清除', 'Archive and clear') : tr('清除', 'Clear') }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.usage-records {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border-top: 1px solid var(--line);
  padding-top: 6px;
  gap: 4px 20px;
}
.usage-record {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: var(--fg-subtle);
  font-size: 12px;
}
.usage-record b {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.usage-record button {
  flex: none;
}
@media (max-width: 699px) {
  .usage-records {
    grid-template-columns: 1fr;
  }
}
.usage-records-dialog {
  display: grid;
  gap: 14px;
}
.usage-records-dialog p {
  margin: 0;
  color: var(--fg-muted);
  font-size: 13px;
  line-height: 1.6;
}
.usage-records-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--fg);
  font-size: 13.5px;
}
.usage-records-row .input {
  width: 14ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.usage-records-dialog .usage-records-note {
  color: var(--fg-subtle);
  font-size: 12.5px;
}
.usage-records-dialog .usage-records-error {
  color: var(--danger);
  font-size: 12.5px;
}
</style>
