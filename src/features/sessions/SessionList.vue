<script setup lang="ts">
// Session list with client query (server filter), tag chip, virtualized
// rows (TanStack) and endless next-page loading — data unbounded, DOM bounded.
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { sessions } from '../../core/state/sessionsSlice.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { relTime } from '../../core/util/fmt.js';
import { debounce } from '../../core/util/fmt.js';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { openNewSession } from './newSessionBus.js';

const router = useRouter();
const query = ref('');
const listEl = ref<HTMLElement | null>(null);

const rows = computed(() => sessions.items.value);
const activeId = computed(() => chat.sessionId.value);

const debouncedSetQuery = debounce((q: string) => sessions.setQuery(q), 300);
watch(query, (q) => debouncedSetQuery(q));

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => listEl.value,
    estimateSize: () => 64,
    overscan: 8,
    getItemKey: (i: number) => rows.value[i]?.id ?? `i${i}`,
  })),
);

// Endless pagination: approach the rendered end → load the next page.
watch(() => virtualizer.value.getVirtualItems().at(-1)?.index, (last) => {
  if (last == null) return;
  if (last >= rows.value.length - 10 && sessions.hasMore.value && !sessions.loadingMore.value) {
    sessions.loadMore();
  }
});

const PHASE_CLASS: Record<string, string> = {
  idle: '', running: 'running', queued: 'queued', compacting: 'compacting',
};
const phaseLabel = (p: string) => i18n.t(`phase.${p}`) ?? p;

function open(id: string) { router.push(`/s/${id}`); }
onMounted(() => { if (!rows.value.length && !sessions.loading.value) sessions.loadFirst(); });
</script>

<template>
  <div class="sessions-pane">
    <div class="sl-head">
      <input v-model="query" type="search" :placeholder="i18n.t('sessions.search')" :aria-label="i18n.t('sessions.search')" />
      <button class="btn ghost icon-only" :title="i18n.t('sessions.new')" :aria-label="i18n.t('sessions.new')"
        @click="openNewSession()"><Icon name="plus" /></button>
    </div>
    <div v-if="sessions.tagFilter.value" class="sl-filters" role="group" :aria-label="i18n.t('sessions.filter.group')">
      <span class="tag-chip">
        {{ sessions.tagFilter.value }}
        <button :aria-label="i18n.t('common.remove')" @click="sessions.setTagFilter('')"><Icon name="x" class="sm" /></button>
      </span>
    </div>
    <div ref="listEl" class="sl-scroll">
      <div v-if="sessions.loading.value && !rows.length" class="sl-state"><Spinner /></div>
      <div v-else-if="sessions.error.value" class="sl-state load-error" role="alert">
        <span>{{ String(sessions.error.value?.detail || sessions.error.value?.message || sessions.error.value) }}</span>
        <button class="btn ghost sm" @click="() => sessions.refresh()">{{ i18n.t('common.retry') }}</button>
      </div>
      <div v-else-if="!rows.length" class="sl-state hint">{{ i18n.t('sessions.empty') }}</div>
      <div v-else :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="rows[v.index]?.id"
          class="sl-row" :class="{ active: rows[v.index]?.id === activeId }"
          :data-testid="`sl-row-${v.index}`"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }"
          @click="rows[v.index] && open(rows[v.index]!.id)">
          <div class="sl-main">
            <div class="sl-name">{{ rows[v.index]?.name || rows[v.index]?.id.slice(0, 8) }}</div>
            <div class="sl-sub">{{ relTime(rows[v.index]?.updated_at_ms, i18n.t) }}</div>
          </div>
          <span v-if="rows[v.index]?.phase && rows[v.index]!.phase !== 'idle'"
            class="phase-dot" :class="PHASE_CLASS[rows[v.index]!.phase] ?? ''"
            :title="phaseLabel(rows[v.index]!.phase!)" />
        </div>
      </div>
    </div>
  </div>
</template>
