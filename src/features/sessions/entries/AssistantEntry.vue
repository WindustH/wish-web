<script setup lang="ts">
// A text segment of an assistant entry, with its preceding steps and notices on a quiet left rail.
import ReplyText from '../../../domain/chat/ReplyText.vue';
import { computed } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import { blobUrl } from '../../../core/api/endpoints.ts';
import { fmtTokens } from '../../../core/util/fmt.ts';
import Markdown from '../../../domain/references/ReferenceMarkdown.vue';
import MessageContext from '../../../domain/chat/entries/MessageContext.vue';
import BlobImage from '../../../domain/media/BlobImage.vue';
import ImageGrid from '../../../domain/chat/entries/ImageGrid.vue';
import { imageParts } from '../../../domain/chat/imageAlbums.ts';

const props = defineProps<{ item: any; session?: string; forcedKeys?: ReadonlySet<string>; locateSeq?: number }>();
const texts = computed(() => (props.item.blocks || []).filter((b: any) => b.type === 'text'));
const parts = computed(() => imageParts<any>(props.item.blocks || []));
const locateIndex = computed(() =>
  props.locateSeq == null ? undefined : props.item.imageSeqs?.indexOf(props.locateSeq),
);
const blobSrc = (b: any) =>
  b.data_base64
    ? `data:${b.mime_type || 'image/png'};base64,${b.data_base64}`
    : b.blob_id || b.sha256
      ? blobUrl(b.blob_id || b.sha256)
      : null;
const usage = computed(() => props.item?.usage ?? null); // grouping projection: last body segment only
const joined = computed(() => texts.value.map((b: any) => b.text).join('\n\n'));
</script>

<template>
  <MessageContext :text="joined" kind="assistant">
    <div class="entry assistant">
      <div class="body">
        <template v-for="(part, i) in parts" :key="i">
          <ImageGrid
            v-if="part.type === 'album'"
            v-slot="{ start, limit }"
            :count="part.blocks.length"
            :force-open="forcedKeys?.has(item.key)"
            :locate-index="locateIndex"
          >
            <div
              v-for="(image, index) in part.blocks.slice(start, limit)"
              :key="start + index"
              class="entry-anchor"
              :data-seq="item.imageSeqs?.[start + index]"
            >
              <BlobImage
                v-if="blobSrc(image)"
                :src="blobSrc(image)!"
                :alt="image.filename || ''"
                loading="lazy"
                decoding="async"
              />
            </div>
          </ImageGrid>
          <ReplyText
            v-else-if="part.block.type === 'text'"
            :seq="item.entry?.seq"
            :block="item.entry?.payload?.content?.indexOf(part.block) ?? -1"
            :text="part.block.text"
          >
            <Markdown data-selectable-text :text="part.block.text" />
          </ReplyText>
          <BlobImage
            v-else-if="part.block.type === 'image' && blobSrc(part.block)"
            class="assistant-img"
            :src="blobSrc(part.block)!"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </template>
        <div v-if="texts.length && usage" class="meta">
          <span>{{
            i18n.t('entry.usage', {
              in: fmtTokens(usage.input_tokens),
              out: fmtTokens(usage.output_tokens),
              total: fmtTokens(usage.total_tokens),
            })
          }}</span>
        </div>
      </div>
    </div>
  </MessageContext>
</template>
