<script setup lang="ts">
import { isSidebarCycle, navigationAction } from '../../core/shortcuts.ts';
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { handledShortcut } from '../../ui/shortcutEvents.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { tr } from '../../core/i18n/tr.ts';
import SessionCommandPalette from './SessionCommandPalette.vue';
import AskContext from '../../domain/chat/AskContext.vue';
import { btwSession, clearBtw } from '../../domain/chat/btwSessions.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
const props = defineProps<{ sessionId: string; mobile: boolean }>();
const emit = defineEmits<{ focus: []; scroll: [direction: -1 | 1, message: boolean] }>();
const active = usePageActivity();
const opened = ref(false);
const btwOpen = ref(false);
const btw = computed(() => (btwOpen.value ? btwSession(props.sessionId) : undefined));
function open() {
  if (props.sessionId && active.value) opened.value = true;
}
watch([() => props.sessionId, active], () => {
  opened.value = false;
  btwOpen.value = false;
});
function keydown(event: KeyboardEvent) {
  const nav = shortcuts.value.value.navigation;
  if (
    !active.value ||
    !props.sessionId ||
    !nav.enabled ||
    handledShortcut(event) ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    opened.value ||
    btwOpen.value
  )
    return;
  const action = navigationAction(nav, event.key);
  if (!action || isSidebarCycle(action) || action === 'openItem' || action === 'exit' || action === 'back') return;
  const editing = (node: EventTarget | null) =>
    node instanceof HTMLElement &&
    (node.isContentEditable || node.matches('input,textarea,select,[role="textbox"],[role="combobox"]'));
  // Check both focus and event ancestry: typing always wins over navigation,
  // including fields inside a non-modal sidebar and inherited contenteditable.
  if (editing(document.activeElement) || event.composedPath().some(editing)) return;
  const overlays =
    '[role="dialog"]:not(.island-sidebar),.island-sheet,[role="alertdialog"],[role="menu"],[role="listbox"]';
  if (
    event
      .composedPath()
      .some((node) => node instanceof HTMLElement && node.matches(`${overlays},[data-keyboard-boundary]`))
  )
    return;
  // A popup owns the keyboard even before focus moves into its portal. Docked
  // and non-modal drawer sidebars remain ordinary workspace surfaces.
  if (
    [...document.querySelectorAll<HTMLElement>(overlays)].some(
      (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
    )
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (action === 'focus') {
    if (!event.repeat) emit('focus');
  } else if (action === 'command') {
    if (!event.repeat) open();
  } else
    emit(
      'scroll',
      action === 'up' || action === 'previousMessage' ? -1 : 1,
      action === 'nextMessage' || action === 'previousMessage',
    );
}
onMounted(() => document.addEventListener('keydown', keydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', keydown, true));
defineExpose({ open });
</script>
<template>
  <SessionCommandPalette
    v-if="opened"
    :key="sessionId"
    :session-id="sessionId"
    @close="opened = false"
    @btw="btwOpen = true"
  />
  <Modal
    :open="btwOpen"
    title="BTW"
    :sheet="mobile"
    content-class="btw-result"
    body-scroll="content"
    @close="btwOpen = false"
  >
    <template #actions
      ><button
        v-if="btw?.turns.length"
        class="btn ghost icon-only"
        :disabled="btw.busy || btw.turns.some((turn) => turn.saving || turn.saveError)"
        :aria-label="tr('清除 BTW 上下文', 'Clear BTW context')"
        @click="clearBtw(sessionId)"
      >
        <Icon name="trash-2" /></button
    ></template>
    <div class="btw-result-body" data-keyboard-boundary>
      <AskContext :session-id="sessionId" />
      <p class="btw-result-note">
        {{
          tr(
            '关闭后继续生成；输入 btw 可重新打开。完成后自动保存到库。',
            'Close while answering; run btw to reopen. Completed answers are saved to the library.',
          )
        }}
      </p>
    </div>
  </Modal>
</template>
<style scoped>
.btw-result-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: min(65dvh, 620px);
}
.btw-result-note {
  flex: none;
  padding: 8px 16px;
  margin: 0;
  color: var(--fg-subtle);
  font-size: 11px;
}
:global(.modal-card.btw-result:not(.modal-page):not(.modal-sheet)) {
  width: min(660px, calc(100vw - 24px));
}
</style>
