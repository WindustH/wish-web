<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { createAbortScope } from '../../core/util/abortScope.ts';
import { replyContextKey } from '../references/context.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import RegionSelection from './RegionSelection.vue';
import { capturePage } from './pageCapture.ts';
import { canCaptureRenderedPage, captureRenderedPage } from './renderedPageCapture.ts';
const props = defineProps<{
  element: HTMLElement;
  session: string;
  blob?: string;
  name: string;
  toolbar?: HTMLElement;
  embedded?: boolean;
  capture?: () => Promise<string>;
}>();
const emit = defineEmits<{ freeze: [boolean] }>();
const replies = inject(replyContextKey, undefined);
const active = usePageActivity();
const available = computed(() => active.value && replies?.session.value === props.session);
const snapshot = ref(''),
  picture = ref<HTMLImageElement>(),
  liveTarget = ref<HTMLElement>(),
  drawingLive = ref(false),
  busy = ref(false),
  selecting = ref(false);
const armed = computed(() => drawingLive.value || !!snapshot.value);
const renderedCapture = canCaptureRenderedPage();
const hint = computed(() => {
  if (busy.value) return tr('正在生成引用…', 'Capturing region…');
  if (drawingLive.value && renderedCapture)
    return tr('拖动框选，松手后共享当前标签页', 'Drag to select, then share this tab');
  return tr('拖动框选画面', 'Drag to reference a region');
});
let request: AbortController | undefined;
function cancel() {
  request?.abort();
  request = undefined;
  if (snapshot.value.startsWith('blob:')) URL.revokeObjectURL(snapshot.value);
  snapshot.value = '';
  drawingLive.value = false;
  busy.value = false;
  selecting.value = false;
  emit('freeze', false);
}
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  }
}
watch(
  () => busy.value || armed.value,
  (on, _, cleanup) => {
    if (on) {
      window.addEventListener('keydown', key, true);
      cleanup(() => window.removeEventListener('keydown', key, true));
    }
  },
);
watch([available, () => props.element, () => props.session, () => props.blob], cancel);
onBeforeUnmount(cancel);
async function captureEmbedded() {
  const controller = request;
  const frame = props.element;
  if (!controller || !(frame instanceof HTMLIFrameElement)) throw new Error('Page is unavailable');
  busy.value = true;
  if (renderedCapture) {
    try {
      return await captureRenderedPage(frame, controller.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        if (request === controller) cancel();
      }
      throw error;
    } finally {
      if (request === controller) busy.value = false;
    }
  }
  const scope = createAbortScope([controller.signal], 15000);
  try {
    const blob = await capturePage(frame, true, scope.signal);
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      scope.signal.throwIfAborted();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    if (scope.timedOut) throw new Error(tr('页面截取超时', 'Page capture timed out'));
    throw error;
  } finally {
    scope.dispose();
    if (request === controller) busy.value = false;
  }
}
async function quote() {
  if (armed.value || busy.value) {
    cancel();
    return;
  }
  const controller = new AbortController();
  request = controller;
  const element = props.element;
  const initial = element.getBoundingClientRect();
  const observer = new ResizeObserver(() => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width !== initial.width || bounds.height !== initial.height) cancel();
  });
  observer.observe(element);
  controller.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  if (props.embedded && element instanceof HTMLIFrameElement) {
    drawingLive.value = true;
    return;
  }
  busy.value = true;
  const timer = setTimeout(() => controller.abort(new Error(tr('页面截取超时', 'Page capture timed out'))), 15000);
  try {
    if (props.capture) {
      const url = await props.capture();
      controller.signal.throwIfAborted();
      snapshot.value = url;
    } else if (element instanceof HTMLIFrameElement) {
      const blob = await capturePage(element, false, controller.signal);
      controller.signal.throwIfAborted();
      snapshot.value = URL.createObjectURL(blob);
    }
    emit('freeze', true);
  } catch (e) {
    observer.disconnect();
    if (request === controller) toast(tr('无法引用画面：', 'Could not capture page: ') + String(e), { tone: 'error' });
  } finally {
    clearTimeout(timer);
    if (request === controller) busy.value = false;
  }
}
</script>
<template>
  <Teleport :to="toolbar || 'body'" :disabled="!toolbar">
    <button
      v-if="available"
      type="button"
      class="btn ghost icon-only page-quote"
      :class="{ floating: !toolbar }"
      :aria-pressed="armed"
      :aria-label="armed || busy ? tr('取消框选', 'Cancel selection') : tr('框选引用', 'Reference page region')"
      :title="tr('框选引用', 'Reference page region')"
      @click="quote"
    >
      <Icon :name="busy ? 'loader-circle' : armed ? 'x' : 'quote'" :class="{ spin: busy }" />
    </button>
  </Teleport>
  <div v-if="armed" class="page-region" :class="{ 'frozen-page': !drawingLive, armed: !selecting && !busy }">
    <div v-if="drawingLive" ref="liveTarget" class="page-region-target" aria-hidden="true" />
    <img v-else ref="picture" :src="snapshot" draggable="false" :alt="name" />
    <span v-if="!selecting" class="quote-hint" role="status">{{ hint }}</span>
    <RegionSelection
      webpage
      once
      :target="drawingLive ? liveTarget : picture"
      :capture="drawingLive ? captureEmbedded : undefined"
      :session="session"
      :blob="blob"
      :name="name"
      @selecting="selecting = $event"
      @complete="cancel"
      @cancel="cancel"
    />
  </div>
</template>
<style scoped>
.page-quote.floating {
  position: absolute;
  z-index: 3;
  right: 8px;
  top: 8px;
  background: var(--bg-raised);
}
.page-region {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: crosshair;
  touch-action: none;
}
.page-region-target {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.page-region img {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
.page-region.armed::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 36%);
  pointer-events: none;
}
.quote-hint {
  position: absolute;
  z-index: 1;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 8px;
  background: rgb(0 0 0 / 60%);
  color: white;
  pointer-events: none;
}
</style>
