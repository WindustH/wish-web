<script setup lang="ts">
// A post a group told this session, from another session or the user, as a card: who wrote it and
// where, the start of it and its images; opened, a window with all of it.
import { computed } from 'vue';
import GroupMessageCard from './GroupMessageCard.vue';
import { tr } from '../../../core/i18n/tr.ts';
import { peerColor } from '../../groups/peerColor.ts';

const props = defineProps<{ item: any }>();
const metadata = computed(() => props.item.entry.payload.metadata);
const content = computed<any[]>(() => props.item.entry.payload.content);
const author = computed(() => {
  const from = metadata.value.from ?? {};
  if (from.kind === 'session') return { name: from.name || from.id.slice(0, 8), color: peerColor(from.id), to: `/s/${from.id}` };
  return { name: tr('你', 'You'), color: 'var(--fg-muted)' };
});
// The model is told the post under a line naming the group and the author, which the card says
// itself. A file comes as a line of its own, which the card counts; images show under the words.
const FILE = '[File sha256:';
const texts = computed<string[]>(() => content.value.filter(b => b.type === 'text').map(b => b.text));
const text = computed(() => {
  const told = texts.value.filter(text => !text.startsWith(FILE)).join('');
  return told.slice(told.indexOf('\n') + 1).trim();
});
const images = computed(() => content.value.filter(b => b.type === 'image' && b.data_base64).map(b => `data:${b.mime_type};base64,${b.data_base64}`));
const files = computed(() => texts.value.filter(text => text.startsWith(FILE)).length);
</script>

<template>
  <div class="entry assistant group-message">
    <div class="body">
      <GroupMessageCard :author="author" :verb="tr('在', 'in')" :group="metadata.group" :text="text" :images="images"
        :note="files ? tr(`${files} 个文件`, `${files} file${files === 1 ? '' : 's'}`) : undefined" :at="item.entry.created_at" />
    </div>
  </div>
</template>
