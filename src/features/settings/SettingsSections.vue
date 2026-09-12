<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useMedia } from '../../ui/composables/useMedia';
import { tr } from './fields';

const props = defineProps<{ prefix: string; sections: { id: string; label: string }[] }>();
const layout = ref<HTMLElement>();
const navigation = ref<HTMLElement>();
const active = ref('');
const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
let viewport: HTMLElement;
let observer: ResizeObserver;
let frame = 0;
const sectionId = (id: string) => `settings-${props.prefix}-${id}`;
const anchorOffset = () => parseFloat(getComputedStyle(viewport).scrollPaddingTop);

function updateActive() {
  frame = 0;
  if (!layout.value!.getClientRects().length) return;
  const sections = [...layout.value!.querySelectorAll<HTMLElement>('.cfg-section')];
  const anchor = viewport.getBoundingClientRect().top + anchorOffset() + 1;
  let current: HTMLElement | undefined = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top > anchor) break;
    current = section;
  }
  if (viewport.scrollHeight > viewport.clientHeight && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1) {
    current = sections.at(-1);
  }
  const next = current?.id || '';
  if (active.value === next) return;
  active.value = next;
  // Keep the active bookmark visible without scrolling the form itself.
  const nav = navigation.value!.closest<HTMLElement>('.settings-categories')!;
  const button = nav.querySelector<HTMLElement>(`[aria-controls="${active.value}"]`);
  if (button?.getClientRects().length && nav.clientHeight) {
    const bounds = nav.getBoundingClientRect(), item = button.getBoundingClientRect();
    if (item.top < bounds.top) nav.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) nav.scrollTop += item.bottom - bounds.bottom;
  }
}
function scheduleUpdate() {
  if (!frame) frame = requestAnimationFrame(updateActive);
}
function jump(id: string) {
  const section = document.getElementById(sectionId(id))!;
  section.focus({ preventScroll: true });
  viewport.scrollTo({
    top: viewport.scrollTop + section.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchorOffset(),
    behavior: reducedMotion.value ? 'instant' : 'smooth',
  });
}
onMounted(() => {
  viewport = layout.value!.closest<HTMLElement>('.settings-scroll')!;
  viewport.addEventListener('scroll', scheduleUpdate, { passive: true });
  observer = new ResizeObserver(scheduleUpdate);
  observer.observe(viewport);
  observer.observe(layout.value!);
  scheduleUpdate();
});
onBeforeUnmount(() => {
  viewport.removeEventListener('scroll', scheduleUpdate);
  observer.disconnect();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <div ref="layout" class="cfg-layout">
    <Teleport :to="`#settings-contents-${prefix}`" defer>
    <nav ref="navigation" class="cfg-sections" :aria-label="tr('配置目录', 'Settings contents')">
      <button v-for="item in sections" :key="item.id" type="button"
        :class="{ active: active === sectionId(item.id) }"
        :aria-current="active === sectionId(item.id) ? 'location' : undefined"
        :aria-controls="sectionId(item.id)" @click="jump(item.id)">{{ item.label }}</button>
    </nav>
    </Teleport>
    <div class="cfg-content">
      <slot name="before" />
      <section v-for="item in sections" :id="sectionId(item.id)" :key="item.id"
        class="cfg-section" tabindex="-1" :aria-labelledby="`${sectionId(item.id)}-heading`">
        <h2 :id="`${sectionId(item.id)}-heading`">{{ item.label }}</h2>
        <slot :section="item.id" />
      </section>
      <slot name="after" />
    </div>
  </div>
</template>
