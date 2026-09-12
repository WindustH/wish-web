<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, provide, readonly, ref, shallowReactive, watch, type VNode } from 'vue';
import { routeLocationKey, routerViewLocationKey, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { pageActivityKey } from '../composables/usePageActivity';

const props = defineProps<{ view: VNode; route: RouteLocationNormalizedLoaded }>();
const router = useRouter();
const root = ref<HTMLElement>();
const active = ref(true);
const localRoute = shallowReactive({ ...props.route });
// Cached descendants must not follow another page's params or child routes.
watch(() => props.route, route => Object.assign(localRoute, route), { flush: 'sync' });
provide(routeLocationKey, localRoute);
provide(routerViewLocationKey, computed(() => props.route));
provide(pageActivityKey, readonly(active));

const positions = new Map<HTMLElement, { top: number; left: number }>();
let frame = 0;
watch(() => router.currentRoute.value.matched[0], record => {
  if (record === props.route.matched[0]) { active.value = true; return; }
  if (!active.value) return;
  // Capture before KeepAlive detaches the DOM and layout observers see zeros.
  positions.clear();
  for (const el of root.value!.querySelectorAll<HTMLElement>('*')) {
    if (el.dataset.following !== 'true' && (el.scrollTop || el.scrollLeft)) positions.set(el, { top: el.scrollTop, left: el.scrollLeft });
  }
  active.value = false;
  cancelAnimationFrame(frame);
}, { flush: 'sync' });
onActivated(async () => {
  active.value = true;
  await nextTick();
  if (!active.value) return;
  frame = requestAnimationFrame(() => {
    for (const [el, position] of positions) {
      if (el.isConnected) el.scrollTo({ ...position, behavior: 'instant' });
    }
  });
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template><div ref="root" class="route-page"><component :is="view" /></div></template>

<style scoped>
.route-page { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
</style>
