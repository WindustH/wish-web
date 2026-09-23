<script setup lang="ts">
// A text segment of an assistant entry (grouping guarantees process blocks
// live in the adjacent thumbnails, never here).
import { computed } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import { blobUrl } from '../../../core/api/endpoints.js';
import { fmtTokens } from '../../../core/util/fmt.js';
import Markdown from '../../../ui/components/Markdown.vue';
import MessageContext from './MessageContext.vue';

const props = defineProps<{ item: any }>();
const texts = computed(() => (props.item.blocks || []).filter((b: any) => b.type === 'text'));
const images = computed(() => (props.item.blocks || []).filter((b: any) => b.type === 'image'));
const blobSrc = (b: any) => b.data_base64
  ? `data:${b.mime_type || 'image/png'};base64,${b.data_base64}`
  : b.sha256 ? blobUrl(b.sha256) : null;
const usage = computed(() => props.item?.usage ?? null);   // grouping projection: last body segment only
const joined = computed(() => texts.value.map((b: any) => b.text).join('\n\n'));
</script>

<template>
  <MessageContext :text="joined" kind="assistant">
    <div class="entry assistant">
      <div class="body">
        <Markdown v-for="(b, i) in texts" :key="i" :text="b.text" />
        <template v-for="(b, i) in images" :key="'img' + i">
          <img v-if="blobSrc(b)" class="assistant-img" :src="blobSrc(b)!" alt="" loading="lazy" decoding="async" />
        </template>
        <div v-if="texts.length && usage" class="meta">
          <span v-if="usage">{{ i18n.t('entry.usage', {
            in: fmtTokens(usage.input_tokens), out: fmtTokens(usage.output_tokens), total: fmtTokens(usage.total_tokens),
          }) }}</span>
        </div>
      </div>
    </div>
  </MessageContext>
</template>
