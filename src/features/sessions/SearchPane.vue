<script setup lang="ts">
// Server-side history search with generational guards; jumping locates the
// seq through the bounded window (never a full scan); errors surface.
import { onUnmounted, ref, watch } from 'vue';
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

interface SearchState { status: string; query?: string; items?: any[]; cursor?: string | null; more?: boolean; error?: any }
const state = ref<SearchState>({ status: 'idle' });
const q = ref('');
let gen = 0;
let alive = true;
// A response may only land while this pane instance is alive AND the query's
// session is still the open one (unmount / switch isolation — round-3 #2).
const owns = (sid: string | null | undefined) => alive && !!sid && chat.sessionId.value === sid;

async function run() {
  const sid = chat.sessionId.value;
  const query = q.value.trim();
  const my = ++gen;
  if (!query) { state.value = { status: 'idle' }; return; }
  state.value = { status: 'busy' };
  try {
    const res = await api.historySearch(sid!, { q: query, order: 'desc', limit: 20 });
    if (my !== gen || !owns(sid)) return;
    state.value = { status: 'done', query, items: res.items ?? [], cursor: res.next_cursor ?? null, more: res.has_more };
  } catch (e) {
    if (my !== gen || !owns(sid)) return;
    state.value = { status: 'error', items: [], error: e };
  }
}

// "More" continues THE QUERY THAT PRODUCED THIS LIST — never whatever is in
// the input right now (audit A4).
async function more() {
  const cursor = state.value.cursor;
  const query = state.value.query;
  if (!cursor || !query || state.value.status === 'busy') return;
  const sid = chat.sessionId.value;
  const my = ++gen;
  state.value = { ...state.value, status: 'busy' };
  try {
    const res = await api.historySearch(sid!, { q: query, order: 'desc', before: cursor, limit: 20 });
    if (my !== gen || !owns(sid)) return;
    state.value = { status: 'done', query, items: [...(state.value.items ?? []), ...(res.items ?? [])], cursor: res.next_cursor ?? null, more: res.has_more };
  } catch (e) {
    if (my !== gen || !owns(sid)) return;
    state.value = { status: 'error', items: state.value.items ?? [], error: e };
  }
}

// Type-to-search (debounced) — same behavior as the audited build.
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(q, () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => run(), 300);
});

async function jump(hit: any) {
  const sid = chat.sessionId.value;
  const ok = await chat.locate(sid!, hit.seq);
  if (!owns(sid)) return;                    // switched/unmounted mid-jump
  if (ok) router.push({ name: 'chat', params: { id: sid! } });
  else state.value = { status: 'error', items: state.value.items ?? [], error: { localized: 'search.locateFailed' } };
}

// Session switch / unmount: drop the debounce, invalidate everything in flight.
watch(() => chat.sessionId.value, () => {
  gen++;
  state.value = { status: 'idle' };
  q.value = '';
});
onUnmounted(() => {
  alive = false;
  gen++;
  if (searchDebounce) clearTimeout(searchDebounce);
});
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
      <span>{{ state.error?.localized ? i18n.t(state.error.localized) : String(state.error?.detail || state.error?.message || state.error) }}</span>
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
