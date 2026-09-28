<script setup lang="ts">
// Right-click, a long press or the context-menu key on a message opens its menu: copy the text, or
// save the image. reka-ui's ContextMenu places, closes and drives it from the keyboard - the same
// menu the session list uses.
import { computed, ref } from 'vue';
import { ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuRoot, ContextMenuTrigger } from 'reka-ui';
import { i18n } from '../../../core/i18n/index.ts';
import { apiFetch } from '../../../core/api/client.ts';
import { platform } from '../../../platform/index.ts';
import Icon from '../../../ui/components/Icon.vue';
import { toast } from '../../../ui/toast.ts';

const props = defineProps<{ text: string; kind: 'user' | 'assistant'; image?: { src: string; filename?: string } }>();
const hasMenu = computed(() => !!props.image || !!props.text.trim());
const open = ref(false);
// A long press ends in a click on the message, which must not also act on it.
let quietUntil = 0;
function noteOpen(value: boolean) {
  open.value = value;
  if (value) quietUntil = performance.now() + 800;
}
function dropClickAfterPress(event: MouseEvent) {
  if (performance.now() > quietUntil) return;
  quietUntil = 0;
  event.preventDefault();
  event.stopPropagation();
}

async function saveImage() {
  if (!props.image) return;
  try {
    const response = await apiFetch(props.image.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const ext = ({ 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
      'image/avif': 'avif', 'image/svg+xml': 'svg' } as Record<string, string>)[blob.type] || 'png';
    const filename = props.image.filename?.replace(/[\\/]/g, '_') || `image.${ext}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    toast((i18n.locale.value === 'zh' ? '保存图片失败：' : 'Could not save image: ') + String(error));
  }
}

async function copyMessage() {
  try {
    await platform('clipboard').writeText(props.text);
  } catch (error) {
    toast((i18n.locale.value === 'zh' ? '复制失败：' : 'Copy failed: ') + String(error));
  }
}
</script>

<template>
  <ContextMenuRoot :modal="false" :press-open-delay="500" @update:open="noteOpen">
    <ContextMenuTrigger as-child :disabled="!hasMenu">
      <div class="message-context" :class="[kind, { open }]" :tabindex="hasMenu ? 0 : undefined" data-context-menu @click.capture="dropClickAfterPress">
        <slot />
      </div>
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="menu-pop message-context-menu" :collision-padding="12">
        <ContextMenuItem v-if="image" class="menu-item" @select="saveImage">
          <Icon name="download" />{{ i18n.locale.value === 'zh' ? '保存图片' : 'Save image' }}
        </ContextMenuItem>
        <ContextMenuItem v-else class="menu-item" @select="copyMessage">
          <Icon name="copy" />{{ i18n.locale.value === 'zh' ? '复制消息' : 'Copy message' }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<style scoped>
.message-context{width:100%;outline:none}
</style>
