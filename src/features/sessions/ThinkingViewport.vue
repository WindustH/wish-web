<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ text: string; tool?: string | null }>();
const viewport = ref<HTMLElement>();
const collapsed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => props.tool, tool => {
  clearTimeout(timer);
  if (tool) timer = setTimeout(() => { collapsed.value = true; }, 650);
  else collapsed.value = false;
}, { immediate: true });
let following = true;
let scrollRaf = 0;
function toggle() { clearTimeout(timer); collapsed.value = !collapsed.value; }
function trackScroll() {
  const el = viewport.value;
  if (!el) return;
  following = el.scrollHeight - el.clientHeight - el.scrollTop < 24;
}
watch(() => props.text, () => {
  if (!following || scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const el = viewport.value;
    if (el && following) el.scrollTop = el.scrollHeight;
  });
});
onUnmounted(() => {
  clearTimeout(timer);
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
});
</script>

<template>
  <div class="thinking-region">
    <button v-if="tool" class="thinking-tool" :aria-expanded="!collapsed" @click="toggle">
      <Icon name="wrench" /><span>{{ i18n.t('entry.toolCall') }} · {{ tool }}</span><Icon :name="collapsed ? 'chevron-right' : 'chevron-down'" />
    </button>
    <div class="thinking-fold" :class="{ collapsed }" :inert="collapsed">
      <div class="thinking-clip">
        <div ref="viewport" class="live-reasoning hint" tabindex="0" :aria-label="i18n.t('entry.thinking')" @scroll="trackScroll">{{ text }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-fold { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 220ms ease, opacity 220ms ease; }
.thinking-fold.collapsed { grid-template-rows: 0fr; opacity: 0; }
.thinking-clip { min-height: 0; overflow: hidden; mask-image: linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent); }
.thinking-fold.collapsed .live-reasoning { visibility: hidden; transition: visibility 0s 220ms; }
@media (prefers-reduced-motion: reduce) { .thinking-fold, .thinking-fold.collapsed .live-reasoning { transition: none; } }
.live-reasoning {
  max-height: min(240px, 30dvh);
  padding-block: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
