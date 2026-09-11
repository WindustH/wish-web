<script setup lang="ts">
// Session list with client query (server filter), tag chip, virtualized
// rows (TanStack) and endless next-page loading — data unbounded, DOM bounded.
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { cfg } from '../../core/config.js';
import { sessions } from '../../core/state/sessionsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import SessionListRow from './SessionListRow.vue';
import SessionListAction from './SessionListAction.vue';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { openNewSession } from './newSession.js';

const route = useRoute();
const query = ref(sessions.query.value);
const composing = ref(false);
const listEl = ref<HTMLElement | null>(null);

const action = ref<{ target: { id: string; name?: string }; kind: 'rename' | 'tags' | 'delete' } | null>(null);
const rows = computed(() => sessions.items.value);
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
function onListScroll() {
  const el = listEl.value;
  if (!el) return;
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (fromBottom < 400 && sessions.hasMore.value && !sessions.loadingMore.value) sessions.loadMore();
}

onMounted(() => { if (!rows.value.length && !sessions.loading.value) sessions.loadFirst(); });
</script>

<template>
  <div class="sessions-pane">
    <div class="sl-masthead">
      <div class="sl-head">
        <Spinner v-if="sessions.loading.value" /><Icon v-else name="search" />
        <input v-model="query" type="search" @compositionstart="composing = true"
          @compositionend="composing = false; sessions.setQuery(query)" :placeholder="i18n.t('sessions.search')" :aria-label="i18n.t('sessions.search')" />
      </div>
      <button class="btn primary icon-only" :title="i18n.t('sessions.new')" :aria-label="i18n.t('sessions.new')"
        @click="openNewSession()"><Icon name="plus" /></button>
    </div>
    <div v-if="sessions.tagFilter.value" class="sl-filters" role="group" :aria-label="i18n.t('sessions.filter.group')">
      <span class="tag-chip">
        {{ sessions.tagFilter.value }}
        <button :aria-label="i18n.t('common.remove')" @click="sessions.setTagFilter('')"><Icon name="x" class="sm" /></button>
      </span>
    </div>
    <div ref="listEl" class="sl-scroll" :aria-busy="sessions.loading.value" @scroll.passive="onListScroll">
      <div v-if="sessions.loading.value && !rows.length" class="sl-state"><Spinner /></div>
      <div v-else-if="sessions.error.value" class="sl-state load-error" role="alert">
        <span>{{ String(sessions.error.value?.detail || sessions.error.value?.message || sessions.error.value) }}</span>
        <button class="btn ghost sm" @click="() => sessions.refresh()">{{ i18n.t('common.retry') }}</button>
      </div>
      <div v-else-if="!rows.length" class="sl-state hint">{{ i18n.t('sessions.empty') }}</div>
      <div v-else :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="rows[v.index]?.id"
          :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)" :data-index="v.index"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', paddingBottom: `${cfg.design.sessionRowGap}px`, transform: `translateY(${v.start}px)` }">
          <SessionListRow :row="rows[v.index]" :index="v.index" :active="rows[v.index]?.id === activeId"
            @action="kind => action = { target: { id: rows[v.index]!.id, name: rows[v.index]!.name }, kind }" />
        </div>
      </div>
    </div>
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = null" />
  </div>
</template>
