<script setup lang="ts">
import Modal from '../../ui/components/Modal.vue';
// Session details and usage; requests belong to this mounted session.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime, fmtTokens } from '../../core/util/fmt.js';
import type { UsageSnapshot } from '../../core/state/statsSlice.js';
import { useMedia } from '../../ui/composables/useMedia.js';

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
  <Modal :open="true" content-class="session-window" :title="i18n.t('info.title')" :page="isMobile" @close="$emit('close')">
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
  </Modal>
</template>
