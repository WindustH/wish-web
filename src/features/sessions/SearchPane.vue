<script setup lang="ts">
// Server-side history search with generational guards; jumping locates the
// seq through the bounded window (never a full scan); errors surface.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime } from '../../core/util/fmt.js';
import Sheet from '../../ui/components/Sheet.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { useMedia } from '../../ui/composables/useMedia.js';

defineEmits<{ close: [] }>();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');

interface SearchState { status: string; items?: any[]; cursor?: string | null; more?: boolean; error?: any }
const state = ref<SearchState>({ status: 'idle' });
const q = ref('');
let gen = 0;

async function run() {
  const query = q.value.trim();
  const my = ++gen;
  if (!query) { state.value = { status: 'idle' }; return; }
  state.value = { status: 'busy' };
  try {
    const res = await api.historySearch(chat.sessionId.value!, { q: query, order: 'desc', limit: 20 });
    if (my !== gen) return;
    state.value = { status: 'done', items: res.items ?? [], cursor: res.next_cursor ?? null, more: res.has_more };
  } catch (e) {
    if (my !== gen) return;
    state.value = { status: 'error', items: [], error: e };
  }
}

async function more() {
  const cursor = state.value.cursor;
  if (!cursor) return;
  const my = ++gen;
  state.value = { ...state.value, status: 'busy' };
  try {
    const res = await api.historySearch(chat.sessionId.value!, { q: q.value.trim(), order: 'desc', before: cursor, limit: 20 });
    if (my !== gen) return;
    state.value = { status: 'done', items: [...(state.value.items ?? []), ...(res.items ?? [])], cursor: res.next_cursor ?? null, more: res.has_more };
  } catch (e) {
    if (my !== gen) return;
    state.value = { status: 'error', items: state.value.items ?? [], error: e };
  }
}

async function jump(hit: any) {
  const ok = await chat.locate(chat.sessionId.value!, hit.seq);
  if (ok) router.push({ name: 'chat', params: { id: chat.sessionId.value! } });
  else state.value = { status: 'error', items: state.value.items ?? [], error: new Error('locate failed: target deeper than the backfill bound') };
}
</script>

<template>
  <Sheet :open="true" :title="i18n.t('search.title')" :mobile="isMobile" @close="$emit('close')">
    <div class="search-row">
      <input v-model="q" type="search" :placeholder="i18n.t('search.placeholder')"
        :aria-label="i18n.t('search.placeholder')" @keydown.enter.prevent="run" />
      <button class="btn primary" :disabled="state.status === 'busy' || !q.trim()" @click="run">
        {{ i18n.t('search.action') }}
      </button>
    </div>
    <Spinner v-if="state.status === 'busy' && !(state.items ?? []).length" />
    <div v-else-if="state.status === 'error'" class="load-error" role="alert">
      <span>{{ String(state.error?.detail || state.error?.message || state.error) }}</span>
      <button class="btn ghost sm" @click="run">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-else-if="state.status === 'done' && !(state.items ?? []).length" class="hint">{{ i18n.t('search.empty') }}</div>
    <div v-else class="search-results">
      <button v-for="hit in state.items ?? []" :key="hit.seq" class="search-result" @click="jump(hit)">
        <span class="sr-meta">#{{ hit.seq }} · {{ hit.kind }} · {{ fmtDateTime(hit.created_at) }}</span>
        <span class="sr-snippet">{{ hit.snippet }}</span>
      </button>
      <button v-if="state.more" class="btn ghost" @click="more">{{ i18n.t('search.more') }}</button>
    </div>
  </Sheet>
</template>
