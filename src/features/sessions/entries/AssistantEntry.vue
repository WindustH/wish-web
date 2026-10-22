<script setup lang="ts">
// A text segment of an assistant entry, with its preceding steps and notices on a quiet left rail.
import { computed } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import { blobUrl } from '../../../core/api/endpoints.ts';
import { fmtTokens } from '../../../core/util/fmt.ts';
import Markdown from '../../../ui/components/Markdown.vue';
import MessageContext from './MessageContext.vue';
import ApiImage from '../../../ui/components/ApiImage.vue';
import HistoryChips from './HistoryChips.vue';
import ImageGrid from './ImageGrid.vue';
import { imageParts } from '../imageAlbums.ts';

const props = defineProps<{ item: any; session?: string; forcedKeys?: ReadonlySet<string> }>();
const before = computed(() => props.item.before ?? []);
const texts = computed(() => (props.item.blocks || []).filter((b: any) => b.type === 'text'));
const parts = computed(() => imageParts<any>(props.item.blocks || []));
const blobSrc = (b: any) => b.data_base64
  ? `data:${b.mime_type || 'image/png'};base64,${b.data_base64}`
  : b.blob_id || b.sha256 ? blobUrl(b.blob_id || b.sha256) : null;
const usage = computed(() => props.item?.usage ?? null);   // grouping projection: last body segment only
const joined = computed(() => texts.value.map((b: any) => b.text).join('\n\n'));
</script>

<template>
  <MessageContext :text="joined" kind="assistant">
    <div class="entry assistant">
      <HistoryChips v-if="before.length" :chips="before" :session="session" :forced-keys="forcedKeys" />
      <div class="body">
        <template v-for="(part, i) in parts" :key="i">
          <ImageGrid v-if="part.type === 'album'" :count="part.blocks.length">
            <div v-for="(image, index) in part.blocks" :key="index" class="entry-anchor" :data-seq="item.imageSeqs?.[index]">
              <ApiImage v-if="blobSrc(image)" :src="blobSrc(image)!" :alt="image.filename || ''" loading="lazy" decoding="async" />
            </div>
          </ImageGrid>
          <Markdown v-else-if="part.block.type === 'text'" :text="part.block.text" />
          <ApiImage v-else-if="part.block.type === 'image' && blobSrc(part.block)" class="assistant-img" :src="blobSrc(part.block)!" alt="" loading="lazy" decoding="async" />
        </template>
        <div v-if="texts.length && usage" class="meta">
          <span>{{ i18n.t('entry.usage', {
            in: fmtTokens(usage.input_tokens), out: fmtTokens(usage.output_tokens), total: fmtTokens(usage.total_tokens),
          }) }}</span>
        </div>
      </div>
    </div>
  </MessageContext>
</template>
