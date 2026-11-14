<script setup lang="ts">
// A message this session sent to another session with `wish session send`, as a card like one received:
// where it went, whom it woke, the start of it; opened, a window with all of it.
import { computed } from 'vue';
import PeerMessageCard from './PeerMessageCard.vue';
import { tr } from '../../../core/i18n/tr.ts';

const props = defineProps<{ item: any }>();
const note = computed(() => props.item.entry.payload.metadata);
const outcome = computed(() => {
  const woken = note.value.woken?.length ?? 0;
  return woken
    ? tr(`唤醒了 ${woken} 个成员`, `Woke ${woken} member${woken === 1 ? '' : 's'}`)
    : tr('没有其他接收者', 'No other recipients');
});
</script>

<template>
  <div class="entry assistant peer-sent">
    <div class="body">
      <PeerMessageCard
        :verb="tr('发到', 'Sent to')"
        :group="note.group"
        :text="note.text ?? ''"
        :note="outcome"
        :at="item.entry.created_at"
      />
    </div>
  </div>
</template>
