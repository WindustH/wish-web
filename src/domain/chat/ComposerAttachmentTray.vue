<script setup lang="ts">
import { ref, watch } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ items: { kind: string; localUrl?: string; name?: string; unavailable?: boolean }[] }>();
const open = ref(false);
const active = usePageActivity();
useBackLayer(
  () => open.value && active.value,
  () => {
    open.value = false;
  },
  () => 75,
);
watch(
  () => props.items,
  () => {
    open.value = false;
  },
);
watch(active, (value) => {
  if (!value) open.value = false;
});
watch(
  () => props.items.length,
  (count) => {
    if (!count) open.value = false;
  },
);
function outside(event: Event) {
  const target = (event as CustomEvent).detail?.originalEvent?.target;
  if (target instanceof Element && target.closest('.attachment-preview-pop')) event.preventDefault();
}
</script>
<template>
  <div class="composer-attachment-tray">
    <PopoverRoot v-if="items.length > 5 || open" v-model:open="open" :modal="false">
      <PopoverTrigger
        class="attachment-stack"
        :aria-label="tr(`查看 ${items.length} 个附件`, `View ${items.length} attachments`)"
      >
        <span class="attachment-stack-images" aria-hidden="true">
          <span
            v-for="(item, index) in items.slice(0, 3)"
            :key="index"
            class="attachment-stack-layer"
            :style="{ '--index': index }"
          >
            <img v-if="item.kind === 'image' && !item.unavailable" :src="item.localUrl" alt="" />
            <Icon v-else name="paperclip" />
          </span>
        </span>
        <span>{{ tr(`${items.length} 个附件`, `${items.length} attachments`) }}</span
        ><Icon name="chevron-down" class="sm" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          class="composer-attachments-window"
          data-keyboard-boundary
          side="top"
          align="start"
          :side-offset="10"
          :collision-padding="12"
          :aria-label="tr('附件', 'Attachments')"
          @interact-outside="outside"
        >
          <div class="dialog-topline">
            <h2>
              {{ tr('附件', 'Attachments') }} <small>{{ items.length }}</small>
            </h2>
            <div class="dialog-toolbar">
              <button class="btn ghost icon-only" :aria-label="tr('关闭', 'Close')" @click="open = false">
                <Icon name="x" />
              </button>
            </div>
          </div>
          <div class="attachment-window-items"><slot /></div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <div v-else class="attach-strip"><slot /></div>
  </div>
</template>
<style scoped>
.composer-attachment-tray {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 12px;
  right: 12px;
  pointer-events: none;
}
.attach-strip {
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--line-strong) 65%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-raised) 78%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgb(0 0 0 / 5%);
  pointer-events: auto;
}
/* Reka portals do not forward the parent scope attribute to the content root. */
:global(.composer-attachments-window) {
  z-index: 75;
  box-sizing: border-box;
  pointer-events: auto;
  width: min(380px, calc(100vw - 48px));
  max-height: min(360px, var(--reka-popover-content-available-height));
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--bg-raised);
  color: var(--fg);
  box-shadow: 0 8px 28px rgb(0 0 0 / 16%);
}
.dialog-topline {
  flex: none;
  margin-bottom: 8px;
}
.dialog-topline small {
  margin-left: 6px;
  color: var(--fg-subtle);
  font-size: 12px;
  font-weight: 400;
}
.attachment-window-items {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: flex-start;
  gap: 12px;
  padding: 8px;
}
.attachment-window-items :deep(.attachment-file) {
  max-width: 100%;
}
.attachment-window-items :deep(.attach-thumb) {
  max-width: 100%;
}
.attachment-stack {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  padding: 6px 12px 6px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-raised);
  color: var(--fg);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
}
.attachment-stack-images {
  position: relative;
  width: 72px;
  height: 48px;
  flex: none;
}
.attachment-stack-layer {
  position: absolute;
  top: 3px;
  left: calc(var(--index) * 12px);
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--bg-raised);
  transform: rotate(calc((var(--index) - 1) * 6deg));
  overflow: hidden;
}
.attachment-stack-layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
