<script setup lang="ts">
import { inject } from 'vue';
import type { BlobMention } from '../../../core/blobMentions.ts';
import { tr } from '../../../core/i18n/tr.ts';
import BlobMentionCard from '../../../domain/references/BlobMentionCard.vue';
import Icon from '../../../ui/components/Icon.vue';
import { openActivityKey } from '../activityDialogs.ts';

const props = defineProps<{ files: readonly { key: string; mention: BlobMention }[] }>();
const open = inject(openActivityKey);
function show() {
  const first = props.files[0];
  if (first) open?.({ chipKey: `mentions:${first.key}`, stepKey: null, mentions: [...props.files] });
}
</script>

<template>
  <div class="blob-mention-cards">
    <div v-if="files.length > 3" class="mention-stack">
      <button class="mention-stack-card" type="button" aria-haspopup="dialog" :disabled="!open" @click="show">
        <Icon name="file" />
        <span class="mention-stack-label">
          <strong>{{ tr(`${files.length} 个引用文件`, `${files.length} referenced files`) }}</strong>
          <small
            >{{
              files
                .slice(0, 3)
                .map((file) => file.mention.name || file.mention.id.slice(0, 12))
                .join(' · ')
            }}
            · …</small
          >
        </span>
        <Icon name="chevron-right" :size="16" />
      </button>
    </div>
    <template v-else>
      <BlobMentionCard v-for="file in files" :key="file.key" :mention="file.mention" />
    </template>
  </div>
</template>

<style scoped>
.blob-mention-cards {
  display: grid;
  gap: 8px;
  padding: 6px 0 12px;
  min-width: 0;
}
.mention-stack {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-width: 0;
  padding-bottom: 12px;
}
.mention-stack::before,
.mention-stack::after {
  z-index: 1;
  content: '';
  position: absolute;
  border: 1px solid var(--line);
  border-radius: 10px;
  pointer-events: none;
}
.mention-stack::before {
  z-index: 0;
  inset: 12px 16px 0;
  background: var(--bg-inset);
}
.mention-stack::after {
  z-index: 1;
  inset: 6px 8px 6px;
  background: var(--bg-raised);
}
.mention-stack-card {
  position: relative;
  z-index: 2;
  font: inherit;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 66px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-raised);
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.mention-stack-card > .icon {
  flex-shrink: 0;
  color: var(--accent);
}
.mention-stack-label {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 4px;
}
.mention-stack-label strong {
  font-size: 13px;
  font-weight: 500;
}
.mention-stack-label small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-subtle);
  font-size: 11px;
}
@media (hover: hover) {
  .mention-stack-card:hover {
    background: var(--bg-hover);
  }
}
</style>
