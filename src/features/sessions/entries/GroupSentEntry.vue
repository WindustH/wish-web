<script setup lang="ts">
// A message this session sent to a group with `wish session send`, as a card like one received:
// where it went, whom it woke, the start of it; opened, a window with all of it.
import { computed } from 'vue';
import GroupMessageCard from './GroupMessageCard.vue';
import { tr } from '../../../core/i18n/tr.ts';

const props = defineProps<{ item: any }>();
const note = computed(() => props.item.entry.payload.metadata);
const outcome = computed(() => {
  const woken = note.value.woken?.length ?? 0;
  return woken ? tr(`唤醒了 ${woken} 个成员`, `Woke ${woken} member${woken === 1 ? '' : 's'}`) : tr('群里没有其他会话', 'No other session there');
});
</script>

<template>
  <div class="entry assistant group-sent">
    <div class="body">
      <GroupMessageCard :verb="tr('发到', 'Sent to')" :group="note.group" :text="note.text ?? ''" :note="outcome" :at="item.entry.created_at" />
    </div>
  </div>
</template>
