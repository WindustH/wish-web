<script setup lang="ts">
// Floating queue dock: one row per message waiting for the running loop's
// next turn boundary. The protocol has no in-place edit, so edit cancels
// the queued delivery and hands the original text back to the composer
// (cancel-first is race-free: if the loop already consumed it, nothing is
// refilled); delete is a plain cancel.
// Refill travels as a callback prop, not an emit: the emit happens after an
// await, and by then the row's removal (local or via the delivery SSE) has
// unmounted this dock — Vue drops emits on unmounted instances.
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import { toast } from '../../ui/toast.js';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ items: any[]; refill: (text: string) => void }>();

async function remove(item: any) {
  try { await chat.cancelQueued(item.id); }
  catch (e: any) { toast(String(e?.detail || e?.message || e)); }
}
async function edit(item: any) {
  try {
    const cancelled = await chat.cancelQueued(item.id);
    if (cancelled) props.refill(item.text || '');
    else toast(i18n.t('chat.queueConsumed'));
  } catch (e: any) { toast(String(e?.detail || e?.message || e)); }
}
</script>

<template>
  <div class="queue-dock" role="list" :aria-label="i18n.t('chat.queueTitle')">
    <div v-for="item in items" :key="item.id" class="queue-item" role="listitem">
      <span class="queue-text">{{ item.text }}</span>
      <Hint :text="i18n.t('chat.queueEdit')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.queueEdit')"
        @click="edit(item)"><Icon name="pencil" /></button></Hint>
      <Hint :text="i18n.t('chat.queueRemove')"><button class="btn ghost icon-only" :aria-label="i18n.t('chat.queueRemove')"
        @click="remove(item)"><Icon name="x" /></button></Hint>
    </div>
  </div>
</template>
