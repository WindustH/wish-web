<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import CommandPanel from './CommandPanel.vue';
import { tr } from '../../core/i18n/tr.ts';
import { useIsMobile } from '../composables/useMedia.ts';
import { usePageActivity } from '../composables/usePageActivity.ts';
import { useBackLayer } from '../composables/useBackLayer.ts';
import { settingsPagesKey } from '../composables/settingsPages.ts';

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    open?: boolean;
    title: string;
    contentClass?: string;
    dismissable?: boolean;
    beforeClose?: () => boolean | Promise<boolean>;
    command?: boolean;
    forceDialog?: boolean;
  }>(),
  { open: true, dismissable: true },
);
const emit = defineEmits<{ close: [] }>();
const host = inject(settingsPagesKey, null);
const mobile = useIsMobile();
const active = usePageActivity();
const inline = computed(() => !!host && !mobile.value && !props.forceDialog);
const fallback = ref<InstanceType<typeof Modal> | InstanceType<typeof CommandPanel>>();
const heading = ref<HTMLElement>();
async function back() {
  if (!props.dismissable || (props.beforeClose && !(await props.beforeClose()))) return false;
  emit('close');
  await nextTick();
  return true;
}
function close() {
  if (inline.value) return back();
  return fallback.value?.close();
}
const page = { back };
const current = computed(() => host?.current.value === page);
watch(
  () => inline.value && props.open && active.value,
  (shown, _, cleanup) => {
    if (!shown || !host) return;
    const opener = document.activeElement;
    host.enter(page);
    void nextTick(() => {
      if (current.value)
        (heading.value?.closest('section')?.querySelector<HTMLElement>('[data-initial-focus]') ?? heading.value)?.focus(
          { preventScroll: true },
        );
    });
    cleanup(() => {
      const wasCurrent = current.value;
      host.leave(page);
      if (wasCurrent && opener instanceof HTMLElement)
        void nextTick(() => {
          if (opener.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
        });
    });
  },
  { immediate: true, flush: 'sync' },
);
useBackLayer(
  () => current.value,
  back,
  () => 55,
);
defineExpose({ close });
</script>
<template>
  <template v-if="inline">
    <Teleport v-if="open && active && host?.target.value" :to="host.target.value">
      <section
        v-show="current"
        :inert="!current"
        class="settings-editor-page"
        :class="contentClass"
        :aria-label="title"
        data-keyboard-boundary
      >
        <header class="settings-subpage-heading settings-detail-heading">
          <button class="btn ghost icon-only" :aria-label="tr('返回', 'Back')" :disabled="!dismissable" @click="back">
            <Icon name="arrow-left" />
          </button>
          <h2 ref="heading" tabindex="-1">{{ title }}</h2>
          <slot name="actions" />
          <button
            class="btn ghost icon-only"
            :aria-label="tr('关闭设置', 'Close settings')"
            @click="host.closeSettings"
          >
            <Icon name="x" />
          </button>
        </header>
        <div class="settings-subpage-content" data-scroll-preserve>
          <slot name="page-tools" />
          <slot />
        </div>
        <footer v-if="$slots.footer" class="settings-subpage-footer"><slot name="footer" /></footer>
      </section>
    </Teleport>
  </template>
  <CommandPanel v-else-if="command && open" ref="fallback" :title="title" v-bind="$attrs" @close="emit('close')">
    <slot />
  </CommandPanel>
  <Modal
    v-else-if="!command"
    ref="fallback"
    :open="open"
    :title="title"
    :before-close="beforeClose"
    :dismissable="dismissable"
    :content-class="contentClass"
    v-bind="$attrs"
    @close="emit('close')"
  >
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
  </Modal>
</template>
<style scoped>
.settings-editor-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
  color: var(--fg);
}
.settings-subpage-footer {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  justify-content: flex-end;
  border-top: 1px solid var(--line);
}
.settings-subpage-heading h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.settings-subpage-heading h2:focus {
  outline: 0;
}
.settings-subpage-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 22px 28px 28px;
}
.settings-subpage-content:has(> .picker) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.settings-subpage-content > :deep(.picker) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.settings-subpage-content > :deep(.picker > .picker-viewport) {
  flex: 1;
  min-height: 0;
}
</style>
