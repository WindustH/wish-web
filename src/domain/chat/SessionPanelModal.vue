<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, ref, watch } from 'vue';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { pageActivityKey } from '../../ui/composables/usePageActivity.ts';
import Modal from '../../ui/components/Modal.vue';
import { sessionPanelCloseKey, sessionPanelElementsKey } from './sessionPanel.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    page?: boolean;
    sidebar?: boolean;
    embedded?: boolean;
    retainContent?: boolean;
    contentClass?: string;
    backLayer?: boolean;
  }>(),
  { backLayer: true },
);
const emit = defineEmits<{ close: [] }>();
const modal = ref<InstanceType<typeof Modal>>();
const panelClose = inject(sessionPanelCloseKey, null);
const panelElements = inject(sessionPanelElementsKey, null);
const active = usePageActivity();
const panelActive = computed(() => active.value && props.open);
provide(pageActivityKey, panelActive);
const close = () => (props.sidebar ? emit('close') : modal.value?.close());
useBackLayer(
  () => !props.embedded && props.backLayer && !!props.sidebar && !!props.page && panelActive.value,
  close,
  () => 45,
);
watch(
  [active, () => props.page, () => props.open],
  ([active, page, open]) => {
    if (!panelClose || props.embedded) return;
    if (active && open && !page) panelClose.value = close;
    else if (panelClose.value === close) panelClose.value = null;
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (panelClose?.value === close) panelClose.value = null;
});
const anchor = () => panelElements?.anchor() ?? null;
const ignoreOutside = (target: Element) => panelElements?.contains(target) ?? false;
defineExpose({ close });
</script>
<template>
  <div v-if="embedded" v-show="open" class="session-panel-embedded" :class="contentClass">
    <slot />
    <div v-if="$slots.footer" class="session-sidebar-footer embedded-footer"><slot name="footer" /></div>
  </div>
  <IslandSidebar
    v-else-if="sidebar"
    :retain-content="retainContent ?? false"
    :open="open"
    :overlay="page"
    :title="title"
    :width="prefs.rightSidebarWidth.value"
    @update:width="prefs.setRightSidebarWidth"
    @close="close"
    @back="close"
  >
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <div class="session-sidebar-content" :class="contentClass"><slot /></div>
    <template v-if="$slots.footer" #footer
      ><div class="session-sidebar-footer"><slot name="footer" /></div
    ></template>
  </IslandSidebar>
  <Modal
    v-else-if="!sidebar"
    ref="modal"
    v-bind="$attrs"
    :open="open"
    :title="title"
    :content-class="contentClass"
    :page="page"
    :back-layer="backLayer"
    :anchor="anchor"
    :ignore-outside="ignoreOutside"
    @close="emit('close')"
  >
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
  </Modal>
</template>

<style scoped>
.session-sidebar-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.session-sidebar-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
}
.embedded-footer {
  position: sticky;
  bottom: -12px;
  background: var(--bg);
  margin: 0 -12px -12px;
}
</style>
