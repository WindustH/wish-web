<script setup lang="ts">
import { unfold, fold, cancelFold } from "../../ui/motion/fold.ts";
import Modal from '../../ui/components/Modal.vue';
// Server-side history search with generational guards; jumping locates the
// seq through the bounded window (never a full scan); errors surface.
import { onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { i18n } from '../../core/i18n/index.ts';
import { fmtDateTime } from '../../core/util/fmt.ts';
import Spinner from '../../ui/components/Spinner.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
import { useSessionRequests } from './useSessionRequests.ts';

const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const isMobile = useIsMobile();

interface SearchState { status: string; query?: string; items?: any[]; more?: boolean; error?: any }
const state = ref<SearchState>({ status: 'idle' });
const q = ref('');
const locating = ref<number | null>(null);
const composing = ref(false);
// A response may only land while this pane is mounted, its session is still the open one, and no
// later query has started (unmount / switch isolation — round-3 #2).
const requests = useSessionRequests();

// Asks for the first `limit` hits of `query`, keeping the list shown until they arrive when asked to.
async function search(query: string, limit: number, keepItems: boolean) {
  const sid = chat.sessionId.value;
  const current = requests.begin(sid);
  state.value = keepItems ? { ...state.value, status: 'busy' } : { status: 'busy' };
  try {
    const res = await api.historySearch(sid!, { q: query, order: 'desc', limit });
    if (!current()) return;
    state.value = { status: 'done', query, items: res.items ?? [], more: res.has_more };
  } catch (e) {
    if (!current()) return;
    state.value = { status: 'error', items: keepItems ? state.value.items ?? [] : [], error: e };
  }
}

async function run() {
  if (composing.value || locating.value !== null) return;
  if (searchDebounce) clearTimeout(searchDebounce);
  const query = q.value.trim();
  if (!query) { requests.invalidate(); state.value = { status: 'idle' }; return; }
  await search(query, 20, false);
}

// "More" continues THE QUERY THAT PRODUCED THIS LIST — never whatever is in
// the input right now (audit A4).
async function more() {
  const query = state.value.query;
  if (!query || state.value.status === 'busy' || locating.value !== null) return;
  await search(query, (state.value.items?.length ?? 0) + 20, true);
}

// Type-to-search (debounced) — same behavior as the audited build.
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
function scheduleSearch() {
  requests.invalidate(); // Invalidate the previous response as soon as the query changes.
  if (searchDebounce) clearTimeout(searchDebounce);
  state.value = { status: q.value.trim() ? 'waiting' : 'idle' };
  if (!composing.value) searchDebounce = setTimeout(() => run(), 300);
}
watch(q, scheduleSearch);

async function jump(hit: any) {
  if (locating.value !== null) return;
  const sid = chat.sessionId.value;
  const current = requests.begin(sid);
  locating.value = hit.seq;
  try {
    const ok = await chat.locate(sid!, hit.seq);
    if (!current()) return;
    if (ok) {
      if (isMobile.value) await router.push({ name: 'chat', params: { id: sid! } });
      else emit('close');
    }
    else state.value = { status: 'error', items: state.value.items ?? [], error: { localized: 'search.locateFailed' } };
  } catch (error) {
    if (current()) state.value = { status: 'error', items: state.value.items ?? [], error };
  } finally {
    if (requests.owns(sid)) locating.value = null;
  }
}

// Session switch / unmount: drop the debounce, invalidate everything in flight.
watch(() => chat.sessionId.value, () => {
  requests.invalidate();
  locating.value = null;
  state.value = { status: 'idle' };
  q.value = '';
});
onUnmounted(() => { if (searchDebounce) clearTimeout(searchDebounce); });
</script>

<template>
  <Modal :open="true" content-class="session-window history-search-window" :title="i18n.t('search.title')" :page="isMobile" @close="$emit('close')">
    <div class="search-row">
      <input v-model="q" class="input" data-initial-focus type="search" :disabled="locating !== null"
        @compositionstart="composing = true" @compositionend="composing = false; scheduleSearch()" :placeholder="i18n.t('search.placeholder')"
        :aria-label="i18n.t('search.placeholder')" @keydown.enter.prevent="run" />
      <button class="btn primary" :disabled="state.status === 'busy' || locating !== null || !q.trim()" @click="run">
        {{ i18n.t('search.action') }}
      </button>
    </div>
    <div class="history-search-content" data-scroll-preserve>
    <div v-if="state.status === 'waiting' || (state.status === 'busy' && !(state.items ?? []).length)" class="search-status" role="status"><Spinner />{{ tr('正在搜索历史…', 'Searching history…') }}</div>
    <div v-else-if="state.status === 'error'" class="load-error" role="alert">
      <span>{{ state.error?.localized ? i18n.t(state.error.localized) : String(state.error?.detail || state.error?.message || state.error) }}</span>
      <button class="btn ghost sm" @click="run">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-else-if="state.status === 'done' && !(state.items ?? []).length" class="hint">{{ i18n.t('search.empty') }}</div>
    <div class="search-results">
<TransitionGroup :css="false" @enter="unfold" @leave="fold" @enter-cancelled="cancelFold" @leave-cancelled="cancelFold">
      <button v-for="hit in state.items ?? []" :key="hit.seq" class="search-result" :disabled="locating !== null" :aria-busy="locating === hit.seq" @click="jump(hit)">
        <span class="sr-meta">#{{ hit.seq }} · {{ hit.kind }} · {{ fmtDateTime(hit.created_at) }}</span>
        <span v-if="locating === hit.seq" class="search-status" role="status"><Spinner />{{ tr('正在定位这条消息…', 'Locating this message…') }}</span>
        <span class="sr-snippet">{{ hit.snippet }}</span>
      </button>
</TransitionGroup>
      <button v-if="state.more" class="btn ghost" :disabled="state.status === 'busy' || locating !== null" @click="more">{{ i18n.t('search.more') }}</button>
    </div>
    </div>
  </Modal>
</template>
