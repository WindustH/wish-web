<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

// Delegation also covers DOM-created editor tokens and rendered Markdown links.
const route = useRoute();
const text = ref('');
const tooltip = ref<HTMLElement>();
const position = ref({ left: '0px', top: '0px', visibility: 'hidden' as 'hidden' | 'visible' });
const id = 'app-hover-hint';
let anchor: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: MutationObserver | undefined;
function hide() {
  clearTimeout(timer);
  observer?.disconnect();
  if (anchor) {
    const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
    if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
    else anchor.removeAttribute('aria-describedby');
  }
  anchor = null;
  text.value = '';
}
function targetOf(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-hint], [title]');
  if (!el) return null;
  // Imported rich text can still carry native titles. Consume them before hover delay.
  if (el.hasAttribute('title')) {
    el.dataset.hint = el.getAttribute('title') || '';
    el.removeAttribute('title');
  }
  return el.dataset.hint ? el : null;
}
function show(el: HTMLElement | null) {
  if (el === anchor) return;
  hide();
  if (!el) return;
  anchor = el;
  timer = setTimeout(async () => {
    if (anchor !== el || !el.isConnected || el.getAttribute('aria-expanded') === 'true') return;
    position.value.visibility = 'hidden';
    text.value = el.dataset.hint || '';
    await nextTick();
    if (anchor !== el || !tooltip.value) return;
    const box = el.getBoundingClientRect(), tip = tooltip.value.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 10, top = (viewport?.offsetTop ?? 0) + 10;
    const right = left + (viewport?.width ?? innerWidth) - 20;
    const bottom = top + (viewport?.height ?? innerHeight) - 20;
    position.value = {
      left: `${Math.max(left, Math.min(box.left + (box.width - tip.width) / 2, right - tip.width))}px`,
      top: `${Math.max(top, Math.min(box.top - tip.height - 7 >= top ? box.top - tip.height - 7 : box.bottom + 7, bottom - tip.height))}px`,
      visibility: 'visible',
    };
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    el.setAttribute('aria-describedby', [...new Set([...ids, id])].join(' '));
    observer = new MutationObserver(() => { if (!el.isConnected) hide(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }, 450);
}
function over(event: PointerEvent) { if (event.pointerType !== 'touch' && !event.buttons) show(targetOf(event.target)); }
function out(event: PointerEvent) { if (anchor && (!(event.relatedTarget instanceof Node) || !anchor.contains(event.relatedTarget))) hide(); }
function focus(event: FocusEvent) {
  const el = targetOf(event.target);
  if (el?.matches(':focus-visible')) show(el);
}
function key(event: KeyboardEvent) { if (event.key === 'Escape') hide(); }
watch(() => route.fullPath, hide);
onMounted(() => {
  document.addEventListener('pointerover', over);
  document.addEventListener('pointerout', out);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', key);
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
});
onBeforeUnmount(() => {
  hide();
  document.removeEventListener('pointerover', over);
  document.removeEventListener('pointerout', out);
  document.removeEventListener('pointerdown', hide, true);
  document.removeEventListener('focusin', focus);
  document.removeEventListener('focusout', hide);
  document.removeEventListener('keydown', key);
  document.removeEventListener('visibilitychange', hide);
  window.removeEventListener('scroll', hide, true);
  window.removeEventListener('resize', hide);
  window.removeEventListener('blur', hide);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="hover-hint">
      <div v-if="text" :id="id" ref="tooltip" role="tooltip" class="control-tooltip delegated-tooltip" :style="position">{{ text }}</div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.delegated-tooltip { position:fixed; pointer-events:none; }
.hover-hint-leave-active { transition:opacity 120ms ease-in; }
.hover-hint-leave-to { opacity:0; }
</style>
