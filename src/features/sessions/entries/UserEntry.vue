<script setup lang="ts">
import { computed } from 'vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Hint from '../../../ui/components/Hint.vue';
import Icon from '../../../ui/components/Icon.vue';
import { blobUrl } from '../../../core/api/endpoints.js';
import { fmtBytes } from '../../../core/util/fmt.js';
import { i18n } from '../../../core/i18n/index.js';
const props = defineProps<{ item: any }>();
const payload = computed(() => props.item.entry?.payload);
const textBlocks = computed(() => (payload.value?.content || []).filter((b: any) => b.type === 'text'));
const joined = computed(() => textBlocks.value.map((b: any) => b.text).join('\n\n'));
const attachments = computed(() => payload.value?.__attachments || (payload.value?.content || []).filter((b: any) => b.type === 'image' || b.type === 'file'));
const imageSrc = (block: any) => block.blob_id ? blobUrl(block.blob_id) : `data:${block.mime_type};base64,${block.data_base64}`;
</script>

<template>
  <div class="entry user">
    <div class="bubble">
      <div v-for="(b, i) in textBlocks" :key="i">{{ b.text }}</div>
      <template v-for="(file, i) in attachments" :key="i">
        <figure v-if="file.type === 'image'" class="message-image">
          <img :src="imageSrc(file)" :alt="file.filename || ''" loading="lazy" />
          <figcaption v-if="file.filename">{{ file.filename }}</figcaption>
        </figure>
        <Hint v-else :text="file.filename">
          <a class="attachment-file message-file" :href="blobUrl(file.blob_id)" :download="file.filename || file.blob_id">
            <Icon name="paperclip" /><div class="attachment-file-label"><span>{{ file.filename || i18n.t('chat.attachment') }}</span><small>{{ fmtBytes(file.byte_count) }}</small></div><Icon name="download" />
          </a>
        </Hint>
      </template>
    </div>
    <div v-if="joined.trim()" class="meta"><CopyButton :text="joined" /></div>
  </div>
</template>
