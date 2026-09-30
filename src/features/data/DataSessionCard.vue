<script setup lang="ts">
// One session in the data panel: what it is called and keeps - its size and what that is made of
// - its tags and when it last changed. A click chooses it; its menu acts on it alone.
import { computed } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import type { SessionBytes, SessionStorage } from '../../core/api/endpoints.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { fmtBytes, fmtDateTime, relTime } from '../../core/util/fmt.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';

const props = defineProps<{
  item: SessionStorage;
  // What a session's bytes can be made of, with the legend's colors.
  parts: { key: keyof SessionBytes; label: string; color: string }[];
  actions: MenuItem[];
  chosen: boolean;
}>();
const emit = defineEmits<{ toggle: []; act: [key: string] }>();
// The parts this session has.
const shownParts = computed(() => props.parts.filter(part => props.item.bytes[part.key] > 0));
</script>

<template>
  <article class="data-card" :class="{ chosen }" role="button" tabindex="0"
    :aria-pressed="chosen" @click="emit('toggle')" @keydown.enter.prevent="emit('toggle')" @keydown.space.prevent="emit('toggle')">
    <header class="data-card-head">
      <span class="data-check" aria-hidden="true"><Icon v-if="chosen" name="check" /></span>
      <h3 :title="sessionTitle(item)">{{ sessionTitle(item) }}</h3>
      <span v-if="item.running" class="data-running" :data-hint="tr('运行中', 'Running')" />
      <span class="data-card-menu" @click.stop @keydown.stop><Menu :items="actions" :label="tr('更多操作', 'More actions')" @select="key => emit('act', key)"><Icon name="ellipsis-vertical" /></Menu></span>
    </header>
    <strong class="data-size">{{ fmtBytes(item.bytes.total) }}</strong>
    <dl class="data-parts">
      <div v-for="part in shownParts" :key="part.key"><dt><i :style="{ background: part.color }" />{{ part.label }}</dt><dd>{{ fmtBytes(item.bytes[part.key]) }}</dd></div>
      <div v-if="!shownParts.length"><dt>{{ tr('没有内容', 'Nothing stored') }}</dt></div>
    </dl>
    <ul v-if="item.tags?.length" class="data-tags"><li v-for="tag in item.tags" :key="tag" class="tag-chip">{{ tag }}</li></ul>
    <p class="data-updated" :title="fmtDateTime(item.updated_at)">{{ tr(`${relTime(item.updated_at, i18n.t)}更新`, `Updated ${relTime(item.updated_at, i18n.t)}`) }}</p>
  </article>
</template>

<style scoped>
.data-card { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 14px 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); cursor: pointer; outline: none; transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast); }
@media (hover: hover) { .data-card:hover { border-color: var(--line-strong); } }
.data-card:focus-visible { box-shadow: 0 0 0 2px var(--focus-ring); }
.data-card.chosen { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--bg-raised)); }
.data-card-head { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.data-card-head h3 { flex: 1; min-width: 0; min-height: 2.9em; margin: 0; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 14px; font-weight: 500; line-height: 1.45; overflow-wrap: anywhere; }
.data-card-head :deep(.btn.icon-only) { width: 28px; height: 28px; min-height: 28px; margin: -4px -6px 0 0; color: var(--fg-subtle); }
.data-card-head :deep(.btn.icon-only .icon) { width: 16px; height: 16px; }
.data-check { display: grid; place-items: center; flex: none; width: 18px; height: 18px; margin-top: 1px; border: 1.5px solid var(--line-strong); border-radius: 5px; color: var(--accent-fg); transition: background var(--dur-fast), border-color var(--dur-fast); }
@media (hover: hover) { .data-card:hover .data-check { border-color: var(--fg-subtle); } }
.data-card.chosen .data-check { border-color: var(--accent); background: var(--accent); }
.data-check .icon { width: 13px; height: 13px; stroke-width: 3; }
.data-running { flex: none; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.data-size { margin-top: -2px; font-size: 22px; font-weight: 600; line-height: 1.2; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
/* What the size is made of: a row per part, its dot the legend's color. */
.data-parts { display: grid; gap: 4px; margin: 0; }
.data-parts div { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; line-height: 1.5; }
.data-parts dt { display: flex; flex: 1; align-items: center; gap: 7px; min-width: 0; color: var(--fg-muted); }
.data-parts dt i { flex: none; width: 7px; height: 7px; border-radius: 2px; }
.data-parts dd { flex: none; margin: 0; color: var(--fg); font-variant-numeric: tabular-nums; }
.data-updated { margin: auto 0 0; padding-top: 10px; border-top: 1px solid var(--line); color: var(--fg-subtle); font-size: 12px; }
.data-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.data-tags .tag-chip { font-size: 11px; }
@media (max-width: 899px) {
  .data-card { gap: 8px; padding: 12px; border: 0; border-radius: 16px; background: var(--bg-group); }
  .data-card.chosen { box-shadow: inset 0 0 0 2px var(--accent); }
  .data-size { font-size: 20px; }
  .data-updated { padding-top: 8px; }
}
</style>
