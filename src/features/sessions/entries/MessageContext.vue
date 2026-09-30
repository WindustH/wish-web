<script setup lang="ts">
// Right-click, a long press or the context-menu key on a message opens its menu: copy the text, or
// save the image.
import { computed } from 'vue';
import { apiFetch } from '../../../core/api/client.ts';
import Menu, { type MenuItem } from '../../../ui/components/Menu.vue';
import { toast } from '../../../ui/toast.ts';
import { tr } from '../../../core/i18n/tr.ts';
import { copyText } from '../../../ui/clipboard.ts';
import { saveBlob } from '../../../ui/download.ts';

const props = defineProps<{ text: string; kind: 'user' | 'assistant'; image?: { src: string; filename?: string } }>();
const hasMenu = computed(() => !!props.image || !!props.text.trim());
const items = computed<MenuItem[]>(() => props.image
  ? [{ key: 'save', icon: 'download', label: tr('保存图片', 'Save image') }]
  : [{ key: 'copy', icon: 'copy', label: tr('复制消息', 'Copy message') }]);
const choose = (key: string) => void (key === 'save' ? saveImage() : copyMessage());

async function saveImage() {
  if (!props.image) return;
  try {
    const response = await apiFetch(props.image.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const ext = ({ 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
      'image/avif': 'avif', 'image/svg+xml': 'svg' } as Record<string, string>)[blob.type] || 'png';
    const filename = props.image.filename?.replace(/[\\/]/g, '_') || `image.${ext}`;
    saveBlob(blob, filename);
  } catch (error) {
    toast((tr('保存图片失败：', 'Could not save image: ')) + String(error));
  }
}

const copyMessage = () => copyText(props.text);
</script>

<template>
  <Menu context :items="items" :disabled="!hasMenu" :within="kind === 'user' ? '.bubble' : '.body'" @select="choose">
    <div class="message-context" :class="kind" :tabindex="hasMenu ? 0 : undefined">
      <slot />
    </div>
  </Menu>
</template>

<style scoped>
.message-context{width:100%;outline:none}
</style>
