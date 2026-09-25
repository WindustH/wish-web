<script setup lang="ts">
import MessageContext from './MessageContext.vue';
import { attachmentPreview, previewAttachment } from '../../../ui/attachmentPreview';
import Hint from '../../../ui/components/Hint.vue';
import Icon from '../../../ui/components/Icon.vue';
import ApiImage from '../../../ui/components/ApiImage.vue';
import { downloadApiFile } from '../../../ui/download';
import { blobMetadata, blobUrl } from '../../../core/api/endpoints.js';
import { ref, watch } from 'vue';
import { fmtBytes } from '../../../core/util/fmt.js';
import { i18n } from '../../../core/i18n/index.js';
const props = defineProps<{ block: any }>();
const fileBytes = ref<number | null>(null);
watch(() => [props.block.blob_id, props.block.byte_count], async ([reference, known], _, onCleanup) => {
  fileBytes.value = typeof known === 'number' ? known : null;
  if (props.block.type !== 'file' || fileBytes.value != null || typeof reference !== 'string') return;
  let active = true;
  onCleanup(() => { active = false; });
  try {
    const metadata = await blobMetadata(reference);
    if (active) fileBytes.value = metadata.byte_count;
  } catch { /* The file remains previewable even if its size cannot be loaded. */ }
}, { immediate: true });
const copyText = () => props.block.type === 'text' ? props.block.text
  : props.block.type === 'image' ? `[Image sha256:${props.block.image_id || props.block.blob_id?.split('/').at(-1) || ''}]` : props.block.filename || '';
const imageSrc = () => props.block.blob_id ? blobUrl(props.block.blob_id) : `data:${props.block.mime_type};base64,${props.block.data_base64}`;
</script>
<template>
  <MessageContext :text="copyText()" :image="block.type === 'image' ? { src: imageSrc(), filename: block.filename } : undefined" kind="user">
    <div class="entry user">
      <div class="bubble" :class="{ 'image-bubble': block.type === 'image', 'attachment-bubble': block.type !== 'text' }">
        <div v-if="block.type === 'text'">{{ block.text }}</div>
        <figure v-else-if="block.type === 'image'" class="message-image">
          <ApiImage :src="imageSrc()" :alt="block.filename || block.placeholder || ''" loading="lazy" />
          <figcaption v-if="block.filename">{{ block.filename }}</figcaption>
        </figure>
        <div v-else class="attachment-file message-file">
          <button type="button" class="message-file-preview" :aria-label="`${i18n.locale.value === 'zh' ? '预览' : 'Preview'} ${block.filename || i18n.t('chat.attachment')}`"
            aria-haspopup="dialog" :aria-expanded="attachmentPreview?.anchor?.dataset.blobId === block.blob_id"
            :data-blob-id="block.blob_id"
            @click="previewAttachment({kind: 'file', name: block.filename, url: blobUrl(block.blob_id)}, $event)">
            <Icon name="paperclip" /><span class="attachment-file-label"><span>{{ block.filename || i18n.t('chat.attachment') }}</span><small v-if="fileBytes != null">{{ fmtBytes(fileBytes) }}</small></span>
          </button>
          <Hint :text="i18n.locale.value === 'zh' ? '下载文件' : 'Download file'"><a class="message-file-download" :href="blobUrl(block.blob_id)" :download="block.filename || block.blob_id"
            :aria-label="i18n.locale.value === 'zh' ? '下载文件' : 'Download file'" @click.stop="downloadApiFile($event, blobUrl(block.blob_id), block.filename || block.blob_id)"><Icon name="download" /></a></Hint>
        </div>
      </div>
    </div>
  </MessageContext>
</template>
<style scoped>
.image-bubble .message-image { margin:0; }
.image-bubble img { max-height:420px; object-fit:contain; }
.message-file-preview{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.message-file-preview>.icon{flex:none;color:var(--fg-subtle)}
.message-file-preview .attachment-file-label>span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.message-file-preview .attachment-file-label>small{display:block}
.message-file-download{display:flex;flex:none;align-items:center;justify-content:center;color:var(--fg-subtle)}
.message-file-download:hover{color:var(--fg);text-decoration:none}
.message-file-preview:focus-visible,.message-file-download:focus-visible{outline:2px solid var(--focus-ring);outline-offset:3px;border-radius:3px}
</style>
