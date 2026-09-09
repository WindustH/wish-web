<script setup lang="ts">
// A text segment of an assistant entry (grouping guarantees process blocks
// live in the adjacent thumbnails, never here).
import { computed } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import { fmtTokens } from '../../../core/util/fmt.js';
import Markdown from '../../../ui/components/Markdown.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';

const props = defineProps<{ item: any }>();
const texts = computed(() => (props.item.blocks || []).filter((b: any) => b.type === 'text'));
const usage = computed(() => props.item.entry?.payload?.usage);
const joined = computed(() => texts.value.map((b: any) => b.text).join('\n\n'));
</script>

<template>
  <div class="entry assistant">
    <div class="avatar-col"><div class="avatar"><Icon name="bot" class="sm" /></div></div>
    <div class="body">
      <Markdown v-for="(b, i) in texts" :key="i" :text="b.text" />
      <div v-if="texts.length" class="meta">
        <span v-if="usage">{{ i18n.t('entry.usage', {
          in: fmtTokens(usage.input_tokens), out: fmtTokens(usage.output_tokens), total: fmtTokens(usage.total_tokens),
        }) }}</span>
        <CopyButton :text="joined" />
      </div>
    </div>
  </div>
</template>
