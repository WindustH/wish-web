<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';
import Modal from '../../components/Modal.vue';
import { sessionPanelCloseKey } from './sessionPanel.ts';
import { usePageActivity } from '../../composables/usePageActivity.ts';
const props = defineProps<{ open: boolean; title: string; page?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const modal = ref<InstanceType<typeof Modal>>();
const panelClose = inject(sessionPanelCloseKey, null);
const active = usePageActivity();
const close = () => modal.value?.close();
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
const anchor = () => document.querySelector<HTMLElement>('.chatbar [data-session-panel][aria-pressed="true"]');
const ignoreOutside = (target: Element) => !!target.closest('[data-session-panel]');
defineExpose({ close });
</script>
<template>
  <Modal
    ref="modal"
    v-bind="$attrs"
    :open="open"
    :title="title"
    :page="page"
    :anchor="anchor"
    :ignore-outside="ignoreOutside"
    @close="emit('close')"
  >
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
  </Modal>
</template>
