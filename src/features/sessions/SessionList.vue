<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
// Session list with client query (server filter), tag chip, virtualized
// rows (TanStack) and endless next-page loading — data unbounded, DOM bounded.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { cfg } from '../../core/config.js';
import { sessions } from '../../core/state/sessionsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import SessionListRow from './SessionListRow.vue';
import SessionListAction from './SessionListAction.vue';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';


const route = useRoute();
const router = useRouter();
const query = ref(sessions.query.value);
const composing = ref(false);
const listEl = ref<HTMLElement | null>(null);

const action = ref<{ target: { id: string; name?: string }; kind: 'rename' | 'tags' | 'delete' } | null>(null);
const rows = computed(() => sessions.items.value);
const rearranging = ref(false);
let motionTimer: ReturnType<typeof setTimeout>;
// Rearrange motion triggers on an id-set change; building the full joined
// string on every row patch is wasted work — length plus the boundary ids
// is a cheap enough fingerprint for a purely cosmetic class toggle.
const rowFingerprint = () => `${rows.value.length}|${rows.value[0]?.id ?? ''}|${rows.value[rows.value.length - 1]?.id ?? ''}`;
watch(rowFingerprint, () => {
  rearranging.value = true;
  clearTimeout(motionTimer);
  motionTimer = setTimeout(() => { rearranging.value = false; }, 280);
});
onBeforeUnmount(() => { clearTimeout(motionTimer); clearTimeout(scrollbarTimer); });
const activeId = computed(() => route.params.id);

// The state slice owns the search debounce; a second UI timer doubles latency.
watch(query, (q) => { if (!composing.value) sessions.setQuery(q); });

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => listEl.value,
    estimateSize: () => cfg.design.sessionRowHeight + cfg.design.sessionRowGap,
    overscan: 8,
    getItemKey: (i: number) => rows.value[i]?.id ?? `i${i}`,
  })),
);

// Endless pagination, driven by real scroll position (the rendered-index
// watch alone stalls: once the last VIRTUAL index stops changing, nothing
// re-fires while the user keeps pinning to the bottom).
// The scrollbar hides at rest: every scroll shows it again, and it fades once
// the list has been still for a moment (the CSS owns the fade itself).
const scrolling = ref(false);
let scrollbarTimer: ReturnType<typeof setTimeout>;
function showScrollbar() {
  scrolling.value = true;
  clearTimeout(scrollbarTimer);
  scrollbarTimer = setTimeout(() => { scrolling.value = false; }, 600);
}
function onListScroll() {
  const el = listEl.value;
  if (!el) return;
  showScrollbar();
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (fromBottom < 400 && sessions.hasMore.value && !sessions.loadingMore.value) sessions.loadMore();
}

onMounted(() => { if (!rows.value.length && !sessions.loading.value) sessions.loadFirst(); });
</script>

<template>
  <div class="sessions-pane">
    <div v-if="route.name === 'all-sessions'" class="sl-all-heading"><RouterLink to="/sessions" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')"><Icon name="arrow-left" /></RouterLink><span>{{ i18n.locale.value === 'zh' ? '全部会话' : 'All sessions' }}</span></div>
    <div class="sl-masthead">
      <div class="sl-head">
        <Spinner v-if="sessions.loading.value" /><Icon v-else name="search" />
        <input v-model="query" type="search" @compositionstart="composing = true"
          @compositionend="composing = false; sessions.setQuery(query)" :placeholder="i18n.t('sessions.search')" :aria-label="i18n.t('sessions.search')" />
      </div>
      <Hint :text="i18n.t('sessions.new')"><button class="btn icon-only sl-add" :aria-label="i18n.t('sessions.new')"
        @click="router.push('/new')"><svg class="sl-add-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.5C6.75 2.5 2.5 6.55 2.5 11.6c0 1.8.5 3.45 1.45 4.85L2.5 21.5l5.2-1.55C9 20.7 10.46 21 12 21c5.3 0 9.5-4.05 9.5-9.4 0-5.05-4.2-9.1-9.5-9.1Zm-.75 5.25h1.5v3h3v1.5h-3v3h-1.5v-3h-3v-1.5h3v-3Z" /></svg></button></Hint>
    </div>
    <div v-if="sessions.tagFilter.value" class="sl-filters" role="group" :aria-label="i18n.t('sessions.filter.group')">
      <span class="tag-chip">
        {{ sessions.tagFilter.value }}
        <button :aria-label="i18n.t('common.remove')" @click="sessions.setTagFilter('')"><Icon name="x" class="sm" /></button>
      </span>
    </div>
    <div ref="listEl" class="sl-scroll" :class="{ scrolling }" data-scroll-preserve :aria-busy="sessions.loading.value" @scroll.passive="onListScroll">
      <div v-if="sessions.loading.value && !rows.length" class="sl-state"><Spinner /></div>
      <div v-else-if="sessions.error.value" class="sl-state load-error" role="alert">
        <span>{{ String(sessions.error.value?.detail || sessions.error.value?.message || sessions.error.value) }}</span>
        <button class="btn ghost sm" @click="() => sessions.refresh()">{{ i18n.t('common.retry') }}</button>
      </div>
      <div v-else-if="!rows.length" class="sl-state hint">{{ i18n.t('sessions.empty') }}</div>
      <TransitionGroup tag="div" name="session-filter" :css="rearranging" :class="{ rearranging }" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="rows[v.index]?.id"
          :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)" :data-index="v.index"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', paddingBottom: `${cfg.design.sessionRowGap}px`, transform: `translateY(${v.start}px)` }">
          <SessionListRow :row="rows[v.index]" :index="v.index" :active="rows[v.index]?.id === activeId"
            @action="kind => action = { target: { id: rows[v.index]!.id, name: rows[v.index]!.name }, kind }" />
        </div>
      </TransitionGroup>
    </div>
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = null" />
  </div>
</template>

<style scoped>
.rearranging { transition: height 240ms cubic-bezier(.2,.7,.2,1); }
.rearranging > div { transition: transform 240ms cubic-bezier(.2,.7,.2,1); }
.session-filter-enter-active, .session-filter-leave-active { transition: scale 240ms cubic-bezier(.2,.7,.2,1), opacity 240ms ease !important; transform-origin: top; }
.session-filter-enter-from, .session-filter-leave-to { scale: 1 0; opacity: 0; }
.session-filter-leave-active { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .rearranging, .rearranging > div, .session-filter-enter-active, .session-filter-leave-active { transition: none !important; }
}
.sl-all-heading { display: flex; align-items: center; gap: 8px; padding: 8px 12px 0; font-size: 14px; }
</style>
