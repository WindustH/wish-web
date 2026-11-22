<script setup lang="ts">
import { computed } from 'vue';
import DataCheckbox from './DataCheckbox.vue';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import type { MenuItem } from '../../ui/components/menuTypes.ts';
import type { SessionBytes, SessionStorage } from '../../core/api/endpoints.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { fmtBytes, fmtDateTime, relTime } from '../../core/util/fmt.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { modelLabel } from '../../domain/providers/modelLabel.ts';

export type DataItem = { kind: 'session' } & SessionStorage;
const props = defineProps<{
  item: DataItem;
  // What the bytes can be made of, with the legend's colors.
  parts: { key: keyof SessionBytes; label: string; color: string }[];
  maxBytes?: number;
  actions: MenuItem[];
  chosen: boolean;
}>();
const emit = defineEmits<{ toggle: [shift: boolean]; act: [key: string] }>();
const shownParts = computed(() => props.parts.filter((part) => props.item.bytes[part.key] > 0));
const largest = computed(() =>
  shownParts.value.reduce<(typeof props.parts)[number] | undefined>(
    (best, part) => (!best || props.item.bytes[part.key] > props.item.bytes[best.key] ? part : best),
    undefined,
  ),
);
const breakdown = computed(() =>
  props.parts.map((part) => part.label + ' ' + fmtBytes(props.item.bytes[part.key] ?? 0)).join(' · '),
);
// Show the session's model before its stored parts.
const about = computed(() => modelLabel(props.item.model ?? '') || props.item.model || '');
const tags = computed(() => (props.item.kind === 'session' ? (props.item.tags ?? []) : []));
const meterWidth = computed(() => {
  const total = props.item.bytes.total;
  return total ? Math.max(2, 100 * Math.sqrt(total / Math.max(total, props.maxBytes ?? total))) : 0;
});
</script>

<template>
  <article class="data-row" :class="{ chosen }" @click="emit('toggle', $event.shiftKey)">
    <DataCheckbox
      class="data-row-select"
      :checked="chosen"
      :label="tr('选择会话', 'Select session') + ' · ' + sessionTitle(item)"
      @toggle="(shift) => emit('toggle', shift)"
    />
    <div class="data-main">
      <div class="data-title">
        <button type="button" :aria-pressed="chosen" @click.stop="emit('toggle', $event.shiftKey)">
          {{ sessionTitle(item) }}
        </button>
        <span v-if="item.running" class="data-running">{{ tr('运行中', 'Running') }}</span>
      </div>
      <div class="data-meta">
        <small class="data-about"
          >{{ about }}<span v-if="about"> · </span
          ><time :title="fmtDateTime(item.updated_at)">{{ relTime(item.updated_at, i18n.t) }}</time></small
        >
        <span v-for="tag in tags.slice(0, 2)" :key="tag" class="tag-chip">{{ tag }}</span>
        <span v-if="tags.length > 2" class="tag-chip" :data-hint="tags.slice(2).join(' · ')"
          >+{{ tags.length - 2 }}</span
        >
      </div>
    </div>
    <div class="composition" :data-hint="breakdown">
      <span class="data-meter" :style="{ width: meterWidth + '%' }" role="img" :aria-label="breakdown"
        ><i
          v-for="part in shownParts"
          :key="part.key"
          :style="{ flexGrow: item.bytes[part.key], background: part.color }"
      /></span>
      <small>{{
        largest ? largest.label + ' ' + fmtBytes(item.bytes[largest.key]) : tr('没有内容', 'Nothing stored')
      }}</small>
    </div>
    <strong class="data-figure">{{ fmtBytes(item.bytes.total) }}</strong>
    <span class="data-row-menu" @click.stop
      ><Menu :items="actions" :label="tr('更多操作', 'More actions')" @select="(key) => emit('act', key)"
        ><Icon name="ellipsis-vertical" /></Menu
    ></span>
  </article>
</template>
<style scoped>
.data-row {
  display: grid;
  grid-template-columns: var(--check-column, 28px) minmax(0, 1fr) auto auto;
  align-items: center;
  cursor: pointer;
  gap: 3px 9px;
  padding: 9px 8px;
  border-top: 1px solid var(--line);
  font-variant-numeric: tabular-nums;
}
@media (hover: hover) {
  .data-row:hover {
    background: var(--bg-hover);
  }
}
.data-row.chosen {
  background: var(--accent-soft);
}
.data-title button {
  background: none;
  color: inherit;
  border: 0;
  font: inherit;
  cursor: pointer;
}
.data-row-select {
  height: 40px;
}
.data-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
.data-meta .tag-chip {
  flex: none;
  white-space: nowrap;
  max-width: 8em;
  overflow: hidden;
  text-overflow: ellipsis;
}
.data-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.data-title button {
  text-align: start;
  padding: 0;
  font-weight: 550;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.data-title button:focus-visible {
  outline-offset: -2px;
}
.data-running {
  color: var(--ok);
  white-space: nowrap;
  font-size: 11px;
}
.data-about,
.composition small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-subtle);
  font-size: 12px;
}
.data-meter {
  display: flex;
  overflow: hidden;
  height: 4px;
  border-radius: 4px;
  background: var(--bg-sunken);
  margin-top: 4px;
}
.data-meter i {
  flex-basis: 0;
}
.data-figure {
  text-align: end;
  font-size: 14px;
  white-space: nowrap;
}
.data-row-select {
  grid-area: 1/1 / span 2;
}
.data-main {
  grid-area: 1/2;
  min-width: 0;
}
.data-figure {
  grid-area: 1/3;
}
.data-row-menu {
  grid-area: 1/4 / span 2;
}
.composition {
  grid-area: 2/2/3/4;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
}
.data-meter {
  margin: 0;
}
@media (max-width: 599px) {
  .data-row {
    --check-column: 24px;
    gap: 3px 7px;
  }
  .data-meter {
    height: 3px;
  }
}
</style>
