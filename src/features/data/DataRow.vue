<script setup lang="ts">
// One session or group in the data panel, as a wide row: its kind by its icon, its name, what it
// is made of, its size - with a bar against the largest one shown - and when it last changed. A
// click chooses it; its menu acts on it alone.
import { computed } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import type { GroupStorage, SessionBytes, SessionStorage } from '../../core/api/endpoints.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { fmtBytes, fmtDateTime, relTime } from '../../core/util/fmt.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { modelLabel } from '../../ui/modelLabel.ts';

export type DataItem = ({ kind: 'session' } & SessionStorage) | ({ kind: 'group' } & GroupStorage);
const props = defineProps<{
  item: DataItem;
  // What the bytes can be made of, with the legend's colors.
  parts: { key: keyof SessionBytes; label: string; color: string }[];
  // The largest size shown, which the bar is measured against.
  scale: number;
  actions: MenuItem[];
  chosen: boolean;
}>();
const emit = defineEmits<{ toggle: []; act: [key: string] }>();
const shownParts = computed(() => props.parts.filter(part => props.item.bytes[part.key] > 0));
// What the row says before its parts: a session's model, a group's members and messages.
const about = computed(() => props.item.kind === 'group'
  ? tr(`${props.item.members} 个成员 · ${props.item.messages} 条消息`, `${props.item.members} member${props.item.members === 1 ? '' : 's'} · ${props.item.messages} message${props.item.messages === 1 ? '' : 's'}`)
  : props.item.model ? modelLabel(props.item.model) || props.item.model : '');
const tags = computed(() => props.item.kind === 'session' ? props.item.tags ?? [] : []);
</script>

<template>
  <article class="data-row" :class="{ chosen }" role="button" tabindex="0"
    :aria-pressed="chosen" @click="emit('toggle')" @keydown.enter.prevent="emit('toggle')" @keydown.space.prevent="emit('toggle')">
    <span class="data-check" aria-hidden="true"><Icon v-if="chosen" name="check" /></span>
    <span class="data-kind" :class="item.kind" :aria-label="item.kind === 'group' ? tr('群组', 'Group') : tr('会话', 'Session')" role="img">
      <Icon :name="item.kind === 'group' ? 'users' : 'chat'" />
    </span>
    <div class="data-main">
      <div class="data-title">
        <h3 :title="sessionTitle(item)">{{ sessionTitle(item) }}</h3>
        <span v-if="item.kind === 'session' && item.running" class="data-running" :data-hint="tr('运行中', 'Running')" />
        <span v-for="tag in tags" :key="tag" class="tag-chip">{{ tag }}</span>
      </div>
      <p class="data-sub">
        <span v-if="about" class="data-about">{{ about }}</span>
        <span v-for="part in shownParts" :key="part.key" class="data-part"><i :style="{ background: part.color }" />{{ part.label }} {{ fmtBytes(item.bytes[part.key]) }}</span>
        <span v-if="!shownParts.length" class="data-part">{{ tr('没有内容', 'Nothing stored') }}</span>
      </p>
    </div>
    <span class="data-meter" aria-hidden="true">
      <template v-for="part in shownParts" :key="part.key"><i :style="{ width: `${scale ? item.bytes[part.key] / scale * 100 : 0}%`, background: part.color }" /></template>
    </span>
    <span class="data-figure">
      <strong>{{ fmtBytes(item.bytes.total) }}</strong>
      <small :title="fmtDateTime(item.updated_at)">{{ relTime(item.updated_at, i18n.t) }}</small>
    </span>
    <span class="data-row-menu" @click.stop @keydown.stop><Menu :items="actions" :label="tr('更多操作', 'More actions')" @select="key => emit('act', key)"><Icon name="ellipsis-vertical" /></Menu></span>
  </article>
</template>

<style scoped>
.data-row { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 8px 10px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); cursor: pointer; outline: none; transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast); }
@media (hover: hover) { .data-row:hover { border-color: var(--line-strong); } }
.data-row:focus-visible { box-shadow: 0 0 0 2px var(--focus-ring); }
.data-row.chosen { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--bg-raised)); }
.data-check { display: grid; place-items: center; flex: none; width: 18px; height: 18px; border: 1.5px solid var(--line-strong); border-radius: 5px; color: var(--accent-fg); transition: background var(--dur-fast), border-color var(--dur-fast); }
@media (hover: hover) { .data-row:hover .data-check { border-color: var(--fg-subtle); } }
.data-row.chosen .data-check { border-color: var(--accent); background: var(--accent); }
.data-check .icon { width: 13px; height: 13px; stroke-width: 3; }
/* A session's bubble and a group's people, each on a tile of its own tint. */
.data-kind { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 9px; background: var(--bg-sunken); color: var(--fg-muted); }
.data-kind.group { background: color-mix(in srgb, var(--chart-2) 16%, var(--bg-raised)); color: var(--chart-2); }
.data-kind .icon { width: 18px; height: 18px; }
.data-main { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.data-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.data-title h3 { min-width: 0; margin: 0; overflow: hidden; font-size: 14px; font-weight: 500; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.data-title .tag-chip { flex: none; font-size: 11px; }
.data-running { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.data-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px; margin: 0; color: var(--fg-subtle); font-size: 12px; line-height: 1.5; font-variant-numeric: tabular-nums; }
.data-about { color: var(--fg-muted); }
.data-part { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.data-part i { width: 6px; height: 6px; border-radius: 2px; }
/* Its size against the largest shown, in its parts' colours. */
.data-meter { display: flex; flex: none; gap: 1px; width: 120px; height: 6px; overflow: hidden; border-radius: 999px; background: var(--bg-sunken); }
.data-meter i { display: block; height: 100%; min-width: 2px; }
.data-figure { display: flex; flex: none; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 76px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.data-figure strong { font-size: 14px; font-weight: 600; letter-spacing: -.01em; }
.data-figure small { color: var(--fg-subtle); font-size: 12px; }
.data-row-menu :deep(.btn.icon-only) { width: 30px; height: 30px; min-height: 30px; color: var(--fg-subtle); }
.data-row-menu :deep(.btn.icon-only .icon) { width: 16px; height: 16px; }
@media (max-width: 899px) {
  .data-row { gap: 10px; padding: 10px 4px 10px 12px; border: 0; border-radius: 14px; background: var(--bg-group); }
  .data-row.chosen { box-shadow: inset 0 0 0 2px var(--accent); }
  .data-meter { display: none; }
  .data-figure { min-width: 0; }
}
/* A phone's row keeps one line under the name: the model, or the members, beside the size. */
@media (max-width: 599px) {
  .data-sub { flex-wrap: nowrap; overflow: hidden; }
  .data-sub:has(.data-about) .data-part { display: none; }
  .data-about { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
