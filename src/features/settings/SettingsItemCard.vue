<script setup lang="ts">
// One configured item in a settings list - a model provider, an MCP server, a search provider.
// On a phone it is a row that opens its editor; on a desktop, a header with its state and actions
// (try it, edit it, delete it). What sits under the header - notes, details, the editor itself -
// comes in the default slot.
import { computed } from 'vue';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';

export type ItemState = { kind: 'ok' | 'error' | 'idle' | 'disabled'; text: string };
const props = defineProps<{
  title: string;
  // The phone row's second line; the desktop header's is the `detail` slot, or this.
  summary: string;
  state?: ItemState | null;
  // What the phone row shows of the state, when it differs from the header's.
  mobileState?: ItemState | null;
  // Its place in an ordered list, shown before the mark.
  position?: number;
  // The item is moved by dragging its header.
  draggable?: boolean;
  // What the actions call the item for assistive technology; the title by default.
  label?: string;
  editHint: string;
  removeHint: string;
  // An action that tries the item, when it has one, and whether that is under way.
  checkHint?: string;
  checking?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ open: []; remove: []; check: [] }>();
const isMobile = useIsMobile();
const name = computed(() => props.label ?? props.title);
const phoneState = computed(() => props.mobileState === undefined ? props.state : props.mobileState);
// A click anywhere on the header but its buttons opens the editor.
const openFrom = (event: MouseEvent) => { if (!(event.target as Element).closest('button')) emit('open'); };
</script>

<template>
  <div class="settings-item">
    <button v-if="isMobile" type="button" class="mobile-settings-row settings-item-row" @click="emit('open')">
      <span class="settings-item-mark"><slot name="mark" /></span>
      <span>{{ title }}<small class="row-preview">{{ summary }}</small></span>
      <small v-if="phoneState" class="settings-item-state" :class="phoneState.kind">{{ phoneState.text }}</small>
      <Icon name="chevron-right" />
    </button>
    <header v-else class="settings-item-heading" :class="{ draggable }" @click="openFrom">
      <span v-if="position != null" class="settings-item-position">{{ position }}</span>
      <span class="settings-item-mark"><slot name="mark" /></span>
      <div class="settings-item-identity">
        <div class="settings-item-title"><h2>{{ title }}</h2><span v-if="state" class="settings-item-state" :class="state.kind">{{ state.text }}</span><slot name="title-extra" /></div>
        <small><slot name="detail">{{ summary }}</slot></small>
      </div>
      <div class="settings-item-actions">
        <Hint v-if="checkHint" :text="checkHint"><button type="button" class="btn ghost icon-only" :disabled="checking || busy" :aria-label="`${checkHint} ${name}`" @click="emit('check')"><Icon :name="checking ? 'loader-circle' : 'refresh-cw'" :class="{ spin: checking }" /></button></Hint>
        <Hint :text="editHint"><button type="button" class="btn ghost icon-only" :aria-label="`${editHint} ${name}`" @click="emit('open')"><Icon name="pencil" /></button></Hint>
        <Hint :text="removeHint"><button type="button" class="btn ghost icon-only settings-item-remove" :aria-label="`${removeHint} ${name}`" @click="emit('remove')"><Icon name="trash-2" /></button></Hint>
      </div>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.settings-item { min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); overflow: hidden; }
.settings-item-heading { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; transition: background var(--dur-fast); }
.settings-item-heading.draggable { padding-left: 12px; cursor: grab; }
@media (hover: hover) { .settings-item-heading:hover { background: var(--bg-hover); } }
.settings-item-position { flex: none; width: 18px; color: var(--fg-faint); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
.settings-item-mark { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--fg-muted); }
.settings-item-identity { flex: 1; min-width: 0; }
.settings-item-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.settings-item-heading h2 { margin: 0; font-size: 15px; line-height: 1.4; }
.settings-item-heading small { display: block; color: var(--fg-subtle); font-size: 12px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-item-state { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px 1px 7px; border-radius: 99px; font-size: 11px; font-weight: 500; line-height: 1.6; white-space: nowrap; background: var(--bg-sunken); color: var(--fg-subtle); }
.settings-item-state::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.settings-item-state.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
.settings-item-state.error { background: var(--err-bg); color: var(--err); }
.settings-item-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.settings-item-remove { color: var(--fg-subtle); }
@media (hover: hover) { .settings-item-remove:hover { color: var(--err); background: var(--err-bg); } }
@media (max-width: 899px) {
  .settings-item { border: 0; border-radius: 0; background: var(--bg-group); background-clip: padding-box; }
  .settings-item-row { width: 100%; min-height: 64px; gap: 14px; }
  .settings-item-row .settings-item-mark { width: 34px; height: 34px; }
  .settings-item-row .settings-item-state { flex: none; }
}
</style>
