<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ items: { kind: string; localUrl?: string; name?: string; unavailable?: boolean }[] }>();
const expanded = ref(false);
const stacked = computed(() => props.items.length > 5 && !expanded.value);
watch(() => [props.items, props.items.length], () => { expanded.value = false; });
</script>
<template>
  <div class="composer-attachment-tray">
    <button v-if="stacked" class="attachment-stack" :aria-label="tr(`展开 ${items.length} 个附件`, `Expand ${items.length} attachments`)" :aria-expanded="false" @click="expanded = true">
      <span class="attachment-stack-images" aria-hidden="true">
        <span v-for="(item, index) in items.slice(0, 3)" :key="index" class="attachment-stack-layer" :style="{ '--index': index }">
          <img v-if="item.kind === 'image' && !item.unavailable" :src="item.localUrl" alt="" />
          <Icon v-else name="paperclip" />
        </span>
      </span>
      <span>{{ tr(`${items.length} 个附件`, `${items.length} attachments`) }}</span><Icon name="chevron-down" class="sm" />
    </button>
    <div v-else class="attachment-tray-expanded">
      <div class="attach-strip"><slot /></div>
      <button v-if="items.length > 5" class="btn ghost icon-only" :aria-label="tr('收起附件', 'Collapse attachments')" :title="tr('收起附件', 'Collapse attachments')" :aria-expanded="true" @click="expanded = false"><Icon name="chevron-down" style="transform: rotate(180deg)" /></button>
    </div>
  </div>
</template>
<style scoped>
.composer-attachment-tray { position: absolute; bottom: calc(100% + 8px); left: 12px; right: 12px; pointer-events: none; }
.attachment-tray-expanded { display: flex; align-items: center; gap: 4px; }
.attach-strip { min-width: 0; max-width: 100%; pointer-events: auto; }
.attachment-tray-expanded > button { flex: none; background: var(--bg-raised); pointer-events: auto; }
.attachment-stack { display: inline-flex; align-items: center; gap: 10px; max-width: 100%; padding: 6px 12px 6px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); color: var(--fg); font: inherit; font-size: 12px; cursor: pointer; pointer-events: auto; box-shadow: 0 2px 8px rgb(0 0 0 / 8%); }
.attachment-stack-images { position: relative; width: 72px; height: 48px; flex: none; }
.attachment-stack-layer { position: absolute; top: 3px; left: calc(var(--index) * 12px); width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--bg-raised); transform: rotate(calc((var(--index) - 1) * 6deg)); overflow: hidden; }
.attachment-stack-layer img { width: 100%; height: 100%; object-fit: cover; }
</style>
