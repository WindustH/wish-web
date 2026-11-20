<script setup lang="ts">
import { focusRegion, rememberWorkspaceFocus } from './workspaceKeyboard.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import SessionListToggle from './SessionListToggle.vue';
import { useSessionMotion } from './useSessionMotion.ts';
useSessionMotion();
import Hint from '../../ui/components/Hint.vue';
// Two-pane shell (desktop): the session list stays mounted while the right
// side routes between (empty) and chat; chat stays mounted while its
// info/search/manage child routes change. Mobile: list and chat are
// exclusive full views.
import { computed, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SessionList from './SessionList.vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import {
  applySavedListWidth,
  cancelListResize,
  onListResizePointerDown,
  onListResizeKeyDown,
  listWidth,
} from './listWidth.ts';
import { tr } from '../../core/i18n/tr.ts';
import { cfg } from '../../core/config.ts';
import { useRecentsSheet } from './useRecentsSheet.ts';

const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();
watch(
  () => route.params.id,
  (id) => prefs.setSessionListOwner(typeof id === 'string' ? id : null),
  { immediate: true, flush: 'sync' },
);
const showList = computed(() => (isMobile.value ? route.name === 'all-sessions' : !prefs.sessionListCollapsed.value));
// A phone's home page and all sessions are one screen: the list is a sheet over the home page.
const home = computed(() => route.name === 'sessions' || route.name === 'all-sessions');
const split = ref<HTMLElement | null>(null);
useRecentsSheet(split);
const returnChat = ref('');
async function openWorkspaceList() {
  returnChat.value = route.fullPath;
  await router.push({ name: 'all-sessions' });
  await nextTick();
  if (split.value) focusRegion(split.value, 'list');
}
async function returnToChat() {
  if (!returnChat.value) return;
  if (router.options.history.state.back === returnChat.value) router.back();
  else await router.replace(returnChat.value);
}
watch(
  () => route.fullPath,
  (path, previous) => {
    if (router.resolve(previous).name !== 'all-sessions' || route.name === 'all-sessions') return;
    if (path === returnChat.value) void nextTick(() => split.value && focusRegion(split.value, 'chat'));
    returnChat.value = '';
  },
);

watch(
  [isMobile, () => route.name],
  ([mobile, name]) => {
    if (!mobile && name === 'all-sessions') void router.replace('/sessions');
  },
  { immediate: true },
);
onMounted(applySavedListWidth);
onDeactivated(cancelListResize);
onBeforeUnmount(cancelListResize);
</script>

<template>
  <div
    ref="split"
    class="sessions-split"
    data-focus-region="chat"
    :data-chat-navigation="
      route.params.id ||
      route.name === 'new-chat' ||
      route.name === 'sessions' ||
      (isMobile && route.name === 'all-sessions' && returnChat)
        ? ''
        : undefined
    "
    :data-focus-indicator="shortcuts.value.value.navigation.indicator || undefined"
    @workspace-open-list="openWorkspaceList"
    @workspace-return-chat="returnToChat"
    @focusin="rememberWorkspaceFocus"
    @pointerdown.capture="rememberWorkspaceFocus"
    :class="{ 'sidebar-collapsed': !isMobile && !showList }"
  >
    <SessionListToggle />
    <SessionList
      v-if="!isMobile || home"
      :class="{ 'is-collapsed': !isMobile && !showList, 'sheet-closed': isMobile && !showList }"
      id="session-list"
    />
    <div v-if="!isMobile" class="session-list-edge">
      <Hint text="↔"
        ><div
          v-show="showList"
          class="list-resize"
          role="separator"
          aria-orientation="vertical"
          :aria-label="tr('调整会话列表宽度', 'Resize session list')"
          tabindex="0"
          aria-controls="session-list"
          :aria-valuenow="listWidth"
          :aria-valuemin="cfg.design.sessionListWidthMin"
          :aria-valuemax="cfg.design.sessionListWidthMax"
          @keydown="onListResizeKeyDown"
          @pointerdown="onListResizePointerDown"
      /></Hint>
    </div>
    <div class="content-pane" :class="{ 'sheet-covered': isMobile && showList }">
      <RouterView v-slot="{ Component }">
        <KeepAlive include="StartChat"><component :is="Component" /></KeepAlive>
      </RouterView>
    </div>
  </div>
</template>
