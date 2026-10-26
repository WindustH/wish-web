<script setup lang="ts">
import { ref } from 'vue';
import ComposerAttachmentTray from '../sessions/ComposerAttachmentTray.vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ count: number; mixed?: boolean }>();
const items = ref(Array.from({ length: props.count }, (_, index) => ({
  kind: props.mixed && index % 2 ? 'file' : 'image',
  name: props.mixed && index % 2 ? `notes-${index + 1}.txt` : `image-${index + 1}.svg`,
  localUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${['#d8bba5','#a8bdba','#c4b6d3'][index % 3]}"/><circle cx="68" cy="26" r="12" fill="#fff4dc"/><path d="M0 84L35 35L60 65L76 48L96 84V96H0Z" fill="#527667"/></svg>`)}`,
})));
</script>
<template>
  <div class="attachment-composer-sample">
    <ComposerAttachmentTray v-if="items.length" :items="items">
      <div v-for="(item, index) in items" :key="item.name" class="attach-thumb">
        <img v-if="item.kind === 'image'" :src="item.localUrl" :alt="item.name" />
        <div v-else class="attachment-file"><Icon name="paperclip" /><div class="attachment-file-label"><span>{{ item.name }}</span><small>128 B</small></div></div>
        <button class="rm" :aria-label="tr('移除附件', 'Remove attachment')" @click="items.splice(index, 1)"><Icon name="x" class="sm" /></button>
      </div>
    </ComposerAttachmentTray>
    <div class="sample-toolbar"><Icon name="image" /><Icon name="paperclip" /><span>BTW</span></div>
    <div class="sample-editor"><span>{{ tr('输入消息…', 'Write a message…') }}</span><Icon name="send" /></div>
  </div>
</template>
<style scoped>
.attachment-composer-sample { position: relative; margin-top: 88px; padding: 14px 16px; border: 1px solid var(--line-strong); border-radius: 18px; background: var(--bg-raised); }
.sample-toolbar, .sample-editor { display: flex; align-items: center; gap: 20px; color: var(--fg-subtle); }
.sample-toolbar { font-size: 12px; font-weight: 600; }
.sample-editor { justify-content: space-between; margin-top: 20px; }
</style>
