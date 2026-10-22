<script setup lang="ts">
// The one line a step's detail is headed by: its kind's icon, its title, what kind of thing it
// is, its place in the history - a copy of it all, and a close. The close means "put this away":
// a window's panel in one place, the window itself in another.
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';
import { toolIcon } from './processDetails.ts';
import { tr } from '../../../core/i18n/tr.ts';

defineProps<{ step: any; name?: string; title: string; fullText: string; isResult: boolean; isReasoning: boolean; diffOnly?: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <div class="process-detail-heading"><Icon :name="isReasoning?'thinking':toolIcon(name)"/><strong class="process-detail-title">{{title}}</strong><span v-if="!isReasoning&&!diffOnly" class="detail-kind">{{isResult?tr('工具结果','Tool result'):tr('工具调用','Tool call')}}</span><span class="detail-sequence">#{{isResult?step.entry.seq:step.fromSeq}}</span><CopyButton v-if="!diffOnly" :text="fullText"/><button class="btn ghost icon-only" :aria-label="tr('关闭','Close')" @click="$emit('close')"><Icon name="x"/></button></div>
</template>
