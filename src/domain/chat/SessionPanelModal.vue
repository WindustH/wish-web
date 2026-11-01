<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, ref, watch } from 'vue';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import Icon from '../../ui/components/Icon.vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { pageActivityKey } from '../../ui/composables/usePageActivity.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import { sessionPanelCloseKey, sessionPanelElementsKey } from './sessionPanel.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
const props = defineProps<{ open: boolean; title: string; page?: boolean; sidebar?: boolean; contentClass?: string }>();
const emit = defineEmits<{ close: [] }>();
const modal = ref<InstanceType<typeof Modal>>();
const panelClose = inject(sessionPanelCloseKey, null);
const panelElements = inject(sessionPanelElementsKey, null);
const active = usePageActivity();
const panelActive = computed(() => active.value && props.open);
provide(pageActivityKey, panelActive);
const close = () => (props.sidebar ? emit('close') : modal.value?.close());
useBackLayer(
  () => !!props.sidebar && !!props.page && panelActive.value,
  close,
  () => 45,
);
watch(
  [active, () => props.page, () => props.open],
  ([active, page, open]) => {
    if (!panelClose) return;
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
  <IslandSidebar
    v-if="sidebar"
    :retain-content="false"
    :open="open"
    :overlay="page"
    :title="title"
    :width="prefs.rightSidebarWidth.value"
    @update:width="prefs.setRightSidebarWidth"
    @close="close"
    @back="close"
  >
    <template #leading
      ><button class="btn ghost icon-only" :aria-label="tr('关闭侧栏', 'Close sidebar')" @click="close">
        <Icon name="chevron-right" /></button
    ></template>
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
</style>
