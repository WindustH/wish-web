<script setup lang="ts">
import Modal from '../../ui/components/Modal.vue';
// Session details and usage; requests belong to this mounted session.
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime, fmtTokens } from '../../core/util/fmt.js';
import type { UsageSnapshot } from '../../core/state/statsSlice.js';
import { useMedia } from '../../ui/composables/useMedia.js';

const UsageCharts = defineAsyncComponent(() => import('../usage/UsageCharts.vue'));
defineEmits<{ close: [] }>();
const isMobile = useMedia('(max-width: 899px)');

const snapshot = computed(() => chat.snapshot.value);
const usage = ref<UsageSnapshot | null>(null);
const err = ref<any>(null);
let alive = true;
let gen = 0;
const owns = (sid: string | null | undefined) => alive && !!sid && chat.sessionId.value === sid;

async function refresh() {
  const id = chat.sessionId.value;
  if (!id) return;
  const my = ++gen;
  err.value = null;
  try {
    const usagePage = await api.sessionUsage(id);
    if (my !== gen || !owns(id)) return;
    usage.value = usagePage;
  } catch (e) {
    if (my !== gen || !owns(id)) return;
    err.value = e;   // failures surface with a retry — never a fake empty list
  }
}
onMounted(refresh);
onUnmounted(() => { alive = false; gen++; });
// Component reuse across sessions: refetch and discard stale usage.
watch(() => chat.sessionId.value, () => { usage.value = null; refresh(); });

const shortId = (id: string) => (id ? `…${String(id).slice(-6)}` : '');
const tokens = computed(() => usage.value?.statistics.totals.tokens ?? null);
</script>

<template>
  <Modal :open="true" content-class="session-window usage-info-window" :title="i18n.t('info.title')" :page="isMobile" @close="$emit('close')">
    <div v-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
      <button class="btn ghost sm" @click="refresh">{{ i18n.t('common.retry') }}</button>
    </div>
    <dl v-if="snapshot" class="info-facts">
      <div class="info-full"><dt>{{ i18n.t('info.name') }}</dt><dd>{{ snapshot.name || '—' }}</dd></div>
      <div class="info-full"><dt>{{ i18n.t('info.provider') }}</dt><dd>{{ snapshot.provider || '—' }} / {{ snapshot.model || '—' }}</dd></div>
      <div><dt>{{ i18n.t('info.generation') }}</dt><dd>#{{ snapshot.generation ?? '—' }} · {{ shortId(snapshot.generation_id) }}
        <template v-if="snapshot.standby_generation"> · {{ i18n.t('info.standby') }} #{{ snapshot.standby_generation }} {{ shortId(snapshot.standby_generation_id) }}</template>
      </dd></div>
      <div><dt>{{ i18n.t('info.revision') }}</dt><dd>{{ snapshot.revision ?? '—' }}</dd></div>
      <div><dt>{{ i18n.t('info.phase') }}</dt><dd>{{ i18n.t(`phase.${snapshot.phase || 'idle'}`) }}</dd></div>
      <div><dt>{{ i18n.t('info.queue') }}</dt><dd>{{ snapshot.queue ?? 0 }}</dd></div>
      <div><dt>{{ i18n.t('info.createdAt') }}</dt><dd>{{ fmtDateTime(snapshot.created_at) }}</dd></div>
      <div><dt>{{ i18n.t('info.updatedAt') }}</dt><dd>{{ fmtDateTime(snapshot.updated_at) }}</dd></div>
    </dl>
    <section v-if="snapshot?.agent_custom?.trim()" class="info-instructions">
      <h4>{{ i18n.t('info.agentCustom') }}</h4>
      <div class="hint" style="white-space:pre-wrap">{{ snapshot.agent_custom || '—' }}</div>
    </section>
    <h4>{{ i18n.t('info.usage') }}</h4>
    <dl v-if="usage" class="info-usage">
      <div><dt>{{ i18n.t('stats.attempts') }}</dt><dd>{{ usage.statistics.model_attempts }}</dd></div>
      <div><dt>{{ i18n.t('stats.tokensIn') }}</dt><dd>{{ fmtTokens(tokens?.input_tokens) }}</dd></div>
      <div><dt>{{ i18n.t('stats.tokensOut') }}</dt><dd>{{ fmtTokens(tokens?.output_tokens) }}</dd></div>
      <div><dt>{{ i18n.t('stats.tokensTotal') }}</dt><dd>{{ fmtTokens(tokens?.total_tokens) }}</dd></div>
    </dl>
    <div v-else-if="!err" class="hint">{{ i18n.t('sessions.loading') }}</div>
    <UsageCharts v-if="chat.sessionId.value" :session-id="chat.sessionId.value" />
  </Modal>
</template>

<style scoped>
.info-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px; margin: 0; font-size: 13px; }
.info-facts > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; align-items: baseline; }
.info-facts .info-full { grid-column: 1 / -1; }
dt { color: var(--fg-subtle); }
dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.info-instructions { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.info-instructions h4 { font-size: 13px; margin: 0 0 8px; padding: 0; border: 0; }
h4 { font: 600 14px/1.5 var(--font); margin: 18px 0 12px; padding-top: 14px; border-top: 1px solid var(--line); }
.info-usage { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0 0 18px; font-size: 12px; }
.info-usage dd { font-size: 15px; font-weight: 500; margin-top: 4px; }
@media (max-width: 599px) { .info-facts { grid-template-columns: 1fr; } .info-usage { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
