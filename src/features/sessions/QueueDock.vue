<script setup lang="ts">
// Queue dock: one row per message waiting for the running loop's next turn
// boundary, rendered as the top of the composer's own surface. The protocol
// has no in-place edit, so edit cancels the queued delivery and hands the
// original text back to the composer (cancel-first is race-free: if the loop
// already consumed it, nothing is refilled); delete is a plain cancel.
// Refill travels as a callback prop, not an emit: the emit happens after an
// await, and by then the row's removal (local or via the delivery SSE) has
// unmounted this dock — Vue drops emits on unmounted instances.
// A delivery joins the visible list only after surviving a short grace
// window: one that is consumed or cancelled almost at once (a turn boundary
// happening just as it lands) must never flash the dock in and out.
import { computed, onUnmounted, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import { toast } from '../../ui/toast.js';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ items: any[]; refill: (text: string, attachments?: any[]) => void }>();

// Attachment indicator: queued rows carry per-item references from the
// control-plane projection; the dock only consumes "has an image" (files do
// not count) and renders one image glyph — the composer picker's own icon —
// never a count.
const hasImages = (item: any): boolean => {
  const a = item.attachments;
  return Array.isArray(a) && a.some((x) => x?.kind === 'image');
};
const refillable = (item: any): boolean =>
  Boolean(item.text) || (Array.isArray(item.attachments) && item.attachments.length > 0);

const GRACE_MS = 400;
const firstSeen = new Map<string, number>();
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
watch(() => props.items, (items) => {
  const live = new Set(items.map((it) => it.id));
  for (const it of items) if (!firstSeen.has(it.id)) firstSeen.set(it.id, Date.now());
  for (const id of firstSeen.keys()) if (!live.has(id)) firstSeen.delete(id);
  const pending = [...firstSeen.values()].some((t) => now.value - t < GRACE_MS);
  if (pending && !ticker) ticker = setInterval(() => {
    now.value = Date.now();
    // The ticker exists only to age the grace window. Once nothing is
    // pending it must stop itself: the queue may then sit unchanged for
    // minutes, and this watch only fires on a items change.
    if (![...firstSeen.values()].some((t) => now.value - t < GRACE_MS)) { clearInterval(ticker!); ticker = null; }
  }, 100);
}, { immediate: true });
const shown = computed(() => {
  const horizon = now.value - GRACE_MS;
  return props.items.filter((it) => (firstSeen.get(it.id) ?? Infinity) <= horizon);
});
onUnmounted(() => { if (ticker) clearInterval(ticker); });

async function remove(item: any) {
  try { await chat.cancelQueued(item.id); }
  catch (e: any) { toast(String(e?.detail || e?.message || e)); }
}
async function edit(item: any) {
  try {
    const cancelled = await chat.cancelQueued(item.id);
    if (cancelled) props.refill(item.text || '', item.attachments);
    else toast(i18n.t('chat.queueConsumed'));
  } catch (e: any) { toast(String(e?.detail || e?.message || e)); }
}
</script>

<template>
  <div class="queue-dock" :class="{ quiet: shown.length === 0 }" role="list" :aria-label="i18n.t('chat.queueTitle')">
    <div v-for="item in shown" :key="item.id" class="queue-item" role="listitem">
      <Hint :text="i18n.t('chat.hasImages')"><span v-if="hasImages(item)" class="queue-images" :title="i18n.t('chat.hasImages')" role="img" :aria-label="i18n.t('chat.hasImages')"><Icon name="image" /></span></Hint>
      <span class="queue-text">{{ item.text || i18n.t('chat.queueUntitled') }}</span>
      <!-- Edit refills the composer with the original text plus re-downloaded
           attachments (the projection carries per-item blob references), so
           it is available whenever there is anything to refill. -->
      <Hint v-if="refillable(item)" :text="i18n.t('chat.queueEdit')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.queueEdit')"
        @click="edit(item)"><Icon name="pencil" /></button></Hint>
      <Hint :text="i18n.t('chat.queueRemove')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.queueRemove')"
        @click="remove(item)"><Icon name="x" /></button></Hint>
    </div>
  </div>
</template>
