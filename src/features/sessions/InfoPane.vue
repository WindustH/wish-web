<script setup lang="ts">
// Session info sheet: snapshot fields, runs list (contract fields:
// started_at_ms / state — never guessed aliases), capabilities with retry.
import { computed, onMounted, ref } from 'vue';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime, fmtTokens } from '../../core/util/fmt.js';
import Sheet from '../../ui/components/Sheet.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { useMedia } from '../../ui/composables/useMedia.js';

defineEmits<{ close: [] }>();
const isMobile = useMedia('(max-width: 899px)');

const snapshot = computed(() => chat.snapshot.value);
const caps = computed(() => chat.capabilities.value);
const runs = ref<any[] | null>(null);
const err = ref<any>(null);
const busy = ref(false);

async function refresh() {
  const id = chat.sessionId.value;
  if (!id) return;
  busy.value = true;
  err.value = null;
  try {
    runs.value = (await api.sessionRuns(id)).items ?? [];
  } catch (e) {
    err.value = e;   // failures surface with a retry — never a fake empty list
  } finally {
    busy.value = false;
  }
}
onMounted(refresh);

const shortId = (id: string) => (id ? `…${String(id).slice(-6)}` : '');
const capsData = computed(() => caps.value?.status === 'ok' ? caps.value.data : null);
</script>

<template>
  <Sheet :open="true" :title="i18n.t('info.title')" :mobile="isMobile" @close="$emit('close')">
    <div v-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
      <button class="btn ghost sm" @click="refresh">{{ i18n.t('common.retry') }}</button>
    </div>
    <dl v-if="snapshot" class="info-list">
      <dt>{{ i18n.t('info.name') }}</dt><dd>{{ snapshot.name || '—' }}</dd>
      <dt>{{ i18n.t('info.provider') }}</dt><dd>{{ snapshot.provider || '—' }} / {{ snapshot.model || '—' }}</dd>
      <dt>{{ i18n.t('info.generation') }}</dt>
      <dd>#{{ snapshot.generation ?? '—' }} · {{ shortId(snapshot.generation_id) }}
        <template v-if="snapshot.standby_generation"> · {{ i18n.t('info.standby') }} #{{ snapshot.standby_generation }} {{ shortId(snapshot.standby_generation_id) }}</template>
      </dd>
      <dt>{{ i18n.t('info.revision') }}</dt><dd>{{ snapshot.revision ?? '—' }}</dd>
      <dt>{{ i18n.t('info.created') }}</dt><dd>{{ fmtDateTime(snapshot.created_at_ms) }}</dd>
      <dt>{{ i18n.t('info.updated') }}</dt><dd>{{ fmtDateTime(snapshot.updated_at_ms) }}</dd>
    </dl>
    <h4>{{ i18n.t('info.runs') }}</h4>
    <Spinner v-if="busy && !runs" />
    <div v-else-if="runs && runs.length" class="runs-list">
      <div v-for="r in runs" :key="r.id" class="run-row">
        <span class="state">{{ r.state }}</span>
        <span class="hint">{{ fmtDateTime(r.started_at_ms) }}</span>
        <span class="hint">{{ r.model_turns }}/{{ r.tool_calls }}</span>
      </div>
    </div>
    <div v-else-if="runs" class="hint">{{ i18n.t('info.noRuns') }}</div>
    <h4>{{ i18n.t('info.capabilities') }}</h4>
    <div v-if="caps?.status === 'error'" class="load-error" role="alert">
      <span>{{ i18n.t('chat.capError') }}</span>
      <button class="btn ghost sm" @click="() => chat.reloadCapabilities()">{{ i18n.t('common.retry') }}</button>
    </div>
    <dl v-else-if="capsData" class="info-list">
      <dt>input</dt><dd>{{ capsData.input_modalities == null ? 'unknown' : capsData.input_modalities.join(', ') }}</dd>
      <dt>images</dt>
      <dd>{{ capsData.images?.max_images_per_message }} × {{ fmtTokens(capsData.images?.max_image_bytes) }}B</dd>
    </dl>
    <div v-else class="hint">{{ i18n.t('sessions.loading') }}</div>
  </Sheet>
</template>
