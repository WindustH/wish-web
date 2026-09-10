<script setup lang="ts">
// Session info sheet: snapshot fields (created_at/updated_at are ISO STRINGS
// per contract), session usage, agent instructions, queue, runs (contract
// fields started_at_ms / state — never guessed aliases), capabilities with
// retry. Runs/usage requests carry sid+unmount ownership: late responses
// never leak into another session's sheet.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtBytes, fmtDateTime, fmtTokens } from '../../core/util/fmt.js';
import Sheet from '../../ui/components/Sheet.vue';
import type { UsageSnapshot } from '../../core/state/statsSlice.js';
import Spinner from '../../ui/components/Spinner.vue';
import { useMedia } from '../../ui/composables/useMedia.js';

defineEmits<{ close: [] }>();
const isMobile = useMedia('(max-width: 899px)');

const snapshot = computed(() => chat.snapshot.value);
const caps = computed(() => chat.capabilities.value);
const runs = ref<any[] | null>(null);
const usage = ref<UsageSnapshot | null>(null);
const err = ref<any>(null);
const busy = ref(false);
let alive = true;
let gen = 0;
const owns = (sid: string | null | undefined) => alive && !!sid && chat.sessionId.value === sid;

async function refresh() {
  const id = chat.sessionId.value;
  if (!id) return;
  const my = ++gen;
  busy.value = true;
  err.value = null;
  try {
    const [runsPage, usagePage] = await Promise.all([
      api.sessionRuns(id),
      api.sessionUsage(id),
    ]);
    if (my !== gen || !owns(id)) return;
    runs.value = runsPage.items ?? [];
    usage.value = usagePage;
  } catch (e) {
    if (my !== gen || !owns(id)) return;
    err.value = e;   // failures surface with a retry — never a fake empty list
  } finally {
    if (my === gen) busy.value = false;
  }
}
onMounted(refresh);
onUnmounted(() => { alive = false; gen++; });
// sheet reuse across sessions: refetch, drop stale panels
watch(() => chat.sessionId.value, () => { runs.value = null; usage.value = null; refresh(); });

const tr = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const shortId = (id: string) => (id ? `…${String(id).slice(-6)}` : '');
const capsData = computed(() => caps.value?.status === 'ok' ? caps.value.data : null);
const tokens = computed(() => usage.value?.statistics.totals.tokens ?? null);
</script>

<template>
  <Sheet :open="true" :title="i18n.t('info.title')" :mobile="isMobile" @close="$emit('close')">
    <div v-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
      <button class="btn ghost sm" @click="refresh">{{ i18n.t('common.retry') }}</button>
    </div>
    <dl v-if="snapshot" class="kv">
      <dt>{{ i18n.t('info.name') }}</dt><dd>{{ snapshot.name || '—' }}</dd>
      <dt>{{ i18n.t('info.provider') }}</dt><dd>{{ snapshot.provider || '—' }} / {{ snapshot.model || '—' }}</dd>
      <dt>{{ i18n.t('info.generation') }}</dt>
      <dd>#{{ snapshot.generation ?? '—' }} · {{ shortId(snapshot.generation_id) }}
        <template v-if="snapshot.standby_generation"> · {{ i18n.t('info.standby') }} #{{ snapshot.standby_generation }} {{ shortId(snapshot.standby_generation_id) }}</template>
      </dd>
      <dt>{{ i18n.t('info.revision') }}</dt><dd>{{ snapshot.revision ?? '—' }}</dd>
      <dt>{{ i18n.t('info.phase') }}</dt><dd>{{ i18n.t(`phase.${snapshot.phase || 'idle'}`) }}</dd>
      <dt>{{ i18n.t('info.queue') }}</dt><dd>{{ snapshot.queue ?? 0 }}</dd>
      <dt>{{ i18n.t('info.createdAt') }}</dt><dd>{{ fmtDateTime(snapshot.created_at) }}</dd>
      <dt>{{ i18n.t('info.updatedAt') }}</dt><dd>{{ fmtDateTime(snapshot.updated_at) }}</dd>
    </dl>
    <section v-if="snapshot?.agent_custom != null" class="setting-row info-instructions">
      <h4>{{ i18n.t('info.agentCustom') }}</h4>
      <div class="hint" style="white-space:pre-wrap">{{ snapshot.agent_custom || '—' }}</div>
    </section>
    <h4>{{ i18n.t('info.usage') }}</h4>
    <dl v-if="usage" class="kv">
      <dt>{{ i18n.t('stats.attempts') }}</dt><dd>{{ usage.statistics?.attempts_with_usage ?? 0 }}</dd>
      <dt>{{ i18n.t('stats.tokensIn') }}</dt><dd>{{ fmtTokens(tokens?.input_tokens) }}</dd>
      <dt>{{ i18n.t('stats.tokensOut') }}</dt><dd>{{ fmtTokens(tokens?.output_tokens) }}</dd>
      <dt>{{ i18n.t('stats.tokensTotal') }}</dt><dd>{{ fmtTokens(tokens?.total_tokens) }}</dd>
    </dl>
    <div v-else-if="!err" class="hint">{{ i18n.t('sessions.loading') }}</div>
    <h4>{{ i18n.t('info.runs') }}</h4>
    <Spinner v-if="busy && !runs" />
    <div v-else-if="runs && runs.length" class="runs-list">
      <div v-for="r in runs" :key="r.id" class="run-row">
        <span class="state">{{ ({ completed: tr('已完成', 'Completed'), running: tr('运行中', 'Running'), canceling: tr('正在停止', 'Stopping'), aborted: tr('已中断', 'Interrupted'), failed: tr('失败', 'Failed') } as Record<string, string>)[r.state] ?? r.state }}</span>
        <span class="hint">{{ fmtDateTime(r.started_at_ms) }}</span>
        <span class="run-counts">{{ tr(`模型调用 ${r.model_turns} 次 · 工具调用 ${r.tool_calls} 次`, `${r.model_turns} model calls · ${r.tool_calls} tool calls`) }}</span>
      </div>
    </div>
    <div v-else-if="runs" class="hint">{{ i18n.t('info.noRuns') }}</div>
    <h4>{{ i18n.t('info.capabilities') }}</h4>
    <div v-if="caps?.status === 'error'" class="load-error" role="alert">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <dl v-else-if="capsData" class="kv">
      <dt>{{ tr('输入类型', 'Input types') }}</dt><dd>{{ capsData.input_modalities == null ? tr('未知', 'Unknown') : capsData.input_modalities.map((type: string) => ({text: tr('文字', 'Text'), image: tr('图片', 'Images')} as Record<string, string>)[type] ?? type).join('、') }}</dd>
      <dt>{{ tr('图片限制', 'Image limits') }}</dt>
      <dd>{{ capsData.images?.max_images_per_message }} × {{ fmtBytes(capsData.images?.max_image_bytes) }}</dd>
    </dl>
    <div v-else class="hint">{{ i18n.t('sessions.loading') }}</div>
  </Sheet>
</template>
