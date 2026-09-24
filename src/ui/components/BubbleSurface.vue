<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ side?: 'top' | 'bottom'; tailX?: number; alignEnd?: boolean }>();
const svg = ref<SVGSVGElement>();
const size = ref({ width: 0, height: 0, radius: 14, center: 24, side: 'top', tail: true });
let resize: ResizeObserver | undefined;
let mutations: MutationObserver | undefined;
let frame = 0;
function measure() {
  frame = 0;
  const panel = svg.value?.parentElement;
  if (!panel) return;
  const style = getComputedStyle(panel);
  const width = parseFloat(style.width), height = parseFloat(style.height);
  const anchor = panel.querySelector<HTMLElement>('[data-bubble-anchor]');
  let center = props.alignEnd ? width - (props.tailX ?? 24) : props.tailX ?? 24;
  if (anchor && props.tailX === undefined) {
    // Normalize the opening animation's scale so the contour uses layout coordinates.
    const rect = panel.getBoundingClientRect(), point = anchor.getBoundingClientRect();
    if (rect.width) center = (point.left + point.width / 2 - rect.left) * width / rect.width;
  }
  size.value = {
    width, height, radius: parseFloat(style.borderTopLeftRadius) || 14, center,
    side: props.side ?? (panel.dataset.side === 'bottom' ? 'top' : 'bottom'),
    tail: !anchor || getComputedStyle(anchor).visibility !== 'hidden',
  };
}
function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
onMounted(() => {
  const panel = svg.value?.parentElement;
  if (!panel) return;
  measure();
  resize = new ResizeObserver(schedule);
  resize.observe(panel);
  mutations = new MutationObserver(schedule);
  mutations.observe(panel, { attributes: true, subtree: true, attributeFilter: ['style', 'data-side'] });
});
watch(() => [props.side, props.tailX, props.alignEnd], schedule);
onBeforeUnmount(() => { resize?.disconnect(); mutations?.disconnect(); cancelAnimationFrame(frame); });

const outline = computed(() => {
  const { width: w, height: h, radius, center, side, tail } = size.value;
  if (w <= 1 || h <= 1) return '';
  const r = Math.min(radius, w / 2, h / 2) - .5;
  const x = Math.max(r + 16, Math.min(center, w - r - 16));
  // The straight edges, rounded corners and tail share one filled and stroked path.
  function tip(y: number, direction: number, walk: number) {
    const p = (dx: number, dy: number) => `${x + dx * walk} ${y + dy * direction}`;
    return `H${x - 15 * walk} C${p(-9, 0)} ${p(-7, 1.5)} ${p(-4, 4.5)} L${p(-.6, 7.7)} Q${p(0, 8.3)} ${p(.6, 7.7)} L${p(4, 4.5)} C${p(7, 1.5)} ${p(9, 0)} ${p(15, 0)}`;
  }
  return `M${r + .5} .5 ${tail && side === 'top' ? tip(.5, -1, 1) : ''}
    H${w - r - .5} A${r} ${r} 0 0 1 ${w - .5} ${r + .5}
    V${h - r - .5} A${r} ${r} 0 0 1 ${w - r - .5} ${h - .5}
    ${tail && side === 'bottom' ? tip(h - .5, 1, -1) : ''}
    H${r + .5} A${r} ${r} 0 0 1 .5 ${h - r - .5}
    V${r + .5} A${r} ${r} 0 0 1 ${r + .5} .5 Z`;
});
</script>

<template>
  <svg ref="svg" class="bubble-surface" :viewBox="`0 0 ${size.width || 1} ${size.height || 1}`" aria-hidden="true" focusable="false">
    <path :d="outline" />
  </svg>
</template>

<style scoped>
.bubble-surface { position:absolute; left:-1px; top:-1px; width:calc(100% + 2px); height:calc(100% + 2px); overflow:visible; pointer-events:none; z-index:-1; filter:drop-shadow(0 8px 20px rgb(0 0 0 / 20%)); }
.bubble-surface path { fill:var(--bubble-surface,var(--bg-overlay)); stroke:var(--line-strong); stroke-width:1; }
</style>
