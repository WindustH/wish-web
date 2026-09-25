<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import { apiFetch } from '../../../core/api/client.js';
import { platform } from '../../../platform/index.js';
import Icon from '../../../ui/components/Icon.vue';
import { toast } from '../../../ui/toast';

const props = defineProps<{ text: string; kind: 'user' | 'assistant'; image?: { src: string; filename?: string } }>();
const root = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const actionButton = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const position = ref({ left: 0, top: 0 });
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let pressPointer: number | undefined;
let pressStart = { x: 0, y: 0 };
let suppressClickUntil = 0;

function cancelPress() {
  clearTimeout(pressTimer);
  pressTimer = undefined;
  pressPointer = undefined;
}

function closeMenu() {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  document.removeEventListener('keydown', onDocumentKeydown, true);
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('resize', closeMenu);
}

function onOutsidePointer(event: PointerEvent) {
  if (!(event.target instanceof Node)) return closeMenu();
  if (!menu.value?.contains(event.target)) closeMenu();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeMenu();
}

function showMenu(x: number, y: number, focus = false) {
  if (!props.image && !props.text.trim()) return;
  cancelPress();
  closeMenu();
  position.value = {
    left: Math.max(12, Math.min(x, window.innerWidth - 172)),
    top: Math.max(12, Math.min(y + 8, window.innerHeight - 58)),
  };
  open.value = true;
  document.addEventListener('pointerdown', onOutsidePointer, true);
  document.addEventListener('keydown', onDocumentKeydown, true);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
  if (focus) void nextTick(() => actionButton.value?.focus({ preventScroll: true }));
}

function onContextMenu(event: MouseEvent) {
  if (!props.image && !props.text.trim()) return;
  event.preventDefault();
  if (open.value && performance.now() < suppressClickUntil) return;
  showMenu(event.clientX, event.clientY);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
  event.preventDefault();
  const bounds = root.value?.getBoundingClientRect();
  if (bounds) showMenu(props.kind === 'user' ? bounds.right - 24 : bounds.left + 24, bounds.top + 24, true);
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch' || !event.isPrimary || (!props.image && !props.text.trim())) return;
  cancelPress();
  pressPointer = event.pointerId;
  pressStart = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    showMenu(event.clientX, event.clientY);
    suppressClickUntil = performance.now() + 800;
  }, 500);
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== pressPointer) return;
  if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) cancelPress();
}

function onClickCapture(event: MouseEvent) {
  if (performance.now() > suppressClickUntil || menu.value?.contains(event.target as Node)) return;
  suppressClickUntil = 0;
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
    closeMenu();
  } catch (error) {
    toast((i18n.locale.value === 'zh' ? '保存图片失败：' : 'Could not save image: ') + String(error));
  }
}

async function copyMessage() {
  try {
    await platform('clipboard').writeText(props.text);
    closeMenu();
  } catch (error) {
    toast((i18n.locale.value === 'zh' ? '复制失败：' : 'Copy failed: ') + String(error));
  }
}

onBeforeUnmount(() => { cancelPress(); closeMenu(); });
</script>

<template>
  <div ref="root" class="message-context" :class="[kind, { open }]" :tabindex="image || text.trim() ? 0 : undefined"
    @contextmenu="onContextMenu" @keydown="onKeydown" @pointerdown="onPointerDown"
    @pointermove="onPointerMove" @pointerup="cancelPress" @pointercancel="cancelPress"
    @click.capture="onClickCapture">
    <slot />
  </div>
  <Teleport to="body">
    <div v-if="open" ref="menu" class="message-context-menu" role="menu" :style="{ left: `${position.left}px`, top: `${position.top}px` }">
      <button v-if="image" ref="actionButton" type="button" role="menuitem" @click="saveImage">
        <Icon name="download" />{{ i18n.locale.value === 'zh' ? '保存图片' : 'Save image' }}
      </button>
      <button v-else ref="actionButton" type="button" role="menuitem" @click="copyMessage">
        <Icon name="copy" />{{ i18n.locale.value === 'zh' ? '复制消息' : 'Copy message' }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.message-context{width:100%;outline:none}
.message-context-menu{position:fixed;z-index:150;min-width:148px;padding:5px;border:1px solid var(--line-strong);border-radius:8px;background:var(--bg-overlay);box-shadow:var(--shadow-pop)}
.message-context-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:36px;padding:6px 10px;border:0;border-radius:5px;background:transparent;color:var(--fg);text-align:left;cursor:pointer}
.message-context-menu button:hover,.message-context-menu button:focus-visible{background:var(--bg-hover)}
.message-context-menu .icon{width:15px;height:15px}
</style>
