<script setup lang="ts">
import { ref } from 'vue';
import type { BlobMention } from '../../core/blobMentions.ts';
import { useFileMention } from '../../domain/references/useFileMention.ts';
import { toast } from '../../ui/toast.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
const props = defineProps<{ mention: BlobMention }>();
const open = useFileMention();
const busy = ref(false);
async function show() {
  if (!open || busy.value) return;
  busy.value = true;
  try {
    await open({ kind: 'blob', ...props.mention });
  } catch (error) {
    toast(describeError(error).message);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <button type="button" class="blob-mention-card" :disabled="busy || !open" :aria-busy="busy" @click="show">
    <Icon :name="mention.page ? 'file-pdf' : mention.time !== undefined ? 'video' : 'file'" />
    <span class="blob-mention-label"
      ><strong>{{ mention.name || mention.id.slice(0, 12) }}</strong>
      <small v-if="mention.page">{{ tr(`第 ${mention.page} 页`, `Page ${mention.page}`) }}</small>
      <small v-else-if="mention.time !== undefined"
        >{{ Math.floor(mention.time / 60) }}:{{ String(Math.floor(mention.time % 60)).padStart(2, '0') }}</small
      >
    </span>
    <Icon name="chevron-right" :size="16" />
  </button>
</template>
<style scoped>
.blob-mention-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-raised);
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.blob-mention-card > .icon {
  flex-shrink: 0;
  color: var(--accent);
}
.blob-mention-label {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.blob-mention-label strong {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.blob-mention-label small {
  color: var(--muted);
  font-size: 11px;
}
.blob-mention-card:hover {
  border-color: var(--line-strong);
}
</style>
