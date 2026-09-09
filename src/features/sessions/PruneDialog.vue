<script setup lang="ts">
// Prune dialog: 7/30/90/custom days, cutoff FROZEN at selection time
// (preview and execute share one value; any change invalidates the
// preview), exact contract report fields, empty = every category zero,
// execution locks every dismiss path.
import { computed, ref, watch } from 'vue';
import * as api from '../../core/api/endpoints.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime } from '../../core/util/fmt.js';
import Modal from '../../ui/components/Modal.vue';

const props = defineProps<{ open: boolean; sessionId: string }>();
const emit = defineEmits<{ close: []; done: [] }>();

const DAY = 86_400_000;
const DAYS = [7, 30, 90];
const days = ref<number | 'custom'>(30);
const custom = ref('');
const selCutoff = ref<number | null>(Date.now() - 30 * DAY);
const report = ref<any>(null);
const cutoffMs = ref<number | null>(null);
const previewBusy = ref(false);
const dialogBusy = ref(false);
const err = ref<any>(null);
const previewGen = ref(0);

const effectiveDays = computed(() => days.value === 'custom' ? Number(custom.value) : days.value);
const validDays = computed(() => {
  const n = effectiveDays.value;
  if (!Number.isInteger(n) || n <= 0) return false;
  const cut = Date.now() - n * DAY;
  return Number.isFinite(cut) && cut > 0;
});
const previewValid = computed(() => report.value != null && cutoffMs.value != null && cutoffMs.value === selCutoff.value);

const cutoffFor = (d: number) => {
  if (!Number.isInteger(d) || d <= 0) return null;
  const cut = Date.now() - d * DAY;
  return Number.isFinite(cut) && cut > 0 ? cut : null;
};

// Any selection change or unmount discards a late preview response.
watch(() => props.open, (v) => { if (!v) { previewGen.value++; previewBusy.value = false; } });

function chooseDays(v: number | 'custom') {
  previewGen.value++;
  days.value = v;
  // Returning to "custom" keeps the typed number and a legal cutoff.
  selCutoff.value = v === 'custom' ? cutoffFor(Number(custom.value)) : cutoffFor(v);
  report.value = null;
  cutoffMs.value = null;
  err.value = null;
}
function setCustomDays(v: string) {
  previewGen.value++;
  custom.value = v;
  selCutoff.value = cutoffFor(Number(v));
  report.value = null;
  cutoffMs.value = null;
  err.value = null;
}

const reclaimed = computed(() => {
  const r = report.value;
  if (!r) return null;
  return {
    entries: r.pruned_entries,
    generations: r.pruned_generations,
    executions: r.pruned_executions,
    imageJobs: r.pruned_image_jobs,
    blobs: r.pruned_blobs,
    bytes: r.pruned_entry_bytes + r.freed_blob_bytes + r.freed_execution_bytes,
  };
});
const empty = computed(() => {
  const r = reclaimed.value;
  return !!r && Object.values(r).every((v) => !v);
});

async function preview() {
  if (!validDays.value) return;
  const gen = ++previewGen.value;
  previewBusy.value = true;
  err.value = null;
  try {
    const res: any = await api.sessionPrune(props.sessionId, {
      before_ms: selCutoff.value!, keep_sealed_generations: 1, dry_run: true,
    });
    if (previewGen.value !== gen) return;
    report.value = res.report;
    cutoffMs.value = selCutoff.value;
  } catch (e) {
    if (previewGen.value !== gen) return;
    err.value = e;
  } finally {
    if (previewGen.value === gen) previewBusy.value = false;
  }
}

async function execute() {
  if (!previewValid.value || empty.value) return;
  dialogBusy.value = true;
  err.value = null;
  try {
    await api.sessionPrune(props.sessionId, {
      before_ms: cutoffMs.value!, keep_sealed_generations: 1, dry_run: false,
    });
    emit('done');
    emit('close');
  } catch (e) {
    err.value = e;   // keep the dialog open with the error visible
  } finally {
    dialogBusy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="i18n.t('manage.prune')" :dismissable="!dialogBusy" @close="emit('close')">
    <p class="hint">{{ i18n.t('prune.desc') }}</p>
    <div class="seg" role="radiogroup" style="margin:12px 0 8px">
      <button v-for="d in DAYS" :key="d" role="radio" :aria-checked="days === d" :disabled="dialogBusy"
        class="seg-item" :class="{ on: days === d }" @click="chooseDays(d)">{{ i18n.t('prune.days', { n: d }) }}</button>
      <button role="radio" :aria-checked="days === 'custom'" :disabled="dialogBusy"
        class="seg-item" :class="{ on: days === 'custom' }" @click="chooseDays('custom')">{{ i18n.t('prune.custom') }}</button>
    </div>
    <div v-if="days === 'custom'" style="margin-bottom:8px">
      <input class="input" type="number" min="1" step="1" :value="custom" :disabled="dialogBusy"
        :placeholder="i18n.t('prune.customDays')" style="width:12rem"
        @input="setCustomDays(($event.target as HTMLInputElement).value)" />
      <span v-if="!validDays" class="warn-note">{{ i18n.t('prune.customInvalid') }}</span>
    </div>
    <p v-if="selCutoff != null" class="hint">{{ i18n.t('prune.cutoff') }}: {{ fmtDateTime(selCutoff) }}</p>
    <div class="btn-row" style="margin:10px 0">
      <button class="btn" :disabled="!validDays || previewBusy || dialogBusy" @click="preview">
        {{ previewBusy ? i18n.t('sessions.loading') : i18n.t('prune.preview') }}
      </button>
    </div>
    <div v-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
    </div>
    <div v-if="reclaimed">
      <p v-if="empty" class="hint">{{ i18n.t('prune.empty') }}</p>
      <ul v-else class="prune-report">
        <li>{{ i18n.t('prune.reportLine', { n: reclaimed.entries, size: `${(reclaimed.bytes / 1024).toFixed(1)} KiB` }) }}</li>
        <li>{{ i18n.t('prune.reportGenerations', { n: reclaimed.generations }) }}</li>
        <li>{{ i18n.t('prune.reportExecutions', { n: reclaimed.executions }) }}</li>
        <li>{{ i18n.t('prune.reportImages', { n: reclaimed.imageJobs }) }}</li>
        <li>{{ i18n.t('prune.reportBlobs', { n: reclaimed.blobs }) }}</li>
      </ul>
    </div>
    <template #footer>
      <button class="btn ghost" :disabled="dialogBusy" @click="emit('close')">{{ i18n.t('manage.cancel') }}</button>
      <button class="btn danger" :disabled="!previewValid || empty || dialogBusy" @click="execute">
        {{ dialogBusy ? i18n.t('sessions.loading') : i18n.t('prune.execute') }}
      </button>
    </template>
  </Modal>
</template>
