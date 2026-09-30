<script setup lang="ts">
import { useSessionMotion } from "./useSessionMotion.ts";
useSessionMotion();
import Hint from '../../ui/components/Hint.vue';
// Two-pane shell (desktop): the session list stays mounted while the right
// side routes between (empty) and chat; chat stays mounted while its
// info/search/manage child routes change. Mobile: list and chat are
// exclusive full views.
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SessionList from './SessionList.vue';
import SessionListToggle from './SessionListToggle.vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { applySavedListWidth, cancelListResize, onListResizePointerDown } from './listWidth.ts';
import { i18n } from '../../core/i18n/index.ts';
import { useRecentsSheet } from './useRecentsSheet.ts';

const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();
const showList = computed(() => isMobile.value ? route.name === 'all-sessions' : !prefs.sessionListCollapsed.value);
// A phone's home page and all sessions are one screen: the list is a sheet over the home page.
const home = computed(() => route.name === 'sessions' || route.name === 'all-sessions');
const split = ref<HTMLElement | null>(null);
useRecentsSheet(split);

watch([isMobile, () => route.name], ([mobile, name]) => {
  if (!mobile && name === 'all-sessions') void router.replace('/sessions');
}, { immediate: true });
onMounted(applySavedListWidth);
onDeactivated(cancelListResize);
onBeforeUnmount(cancelListResize);
</script>

<template>
  <div ref="split" class="sessions-split">
    <SessionList v-if="!isMobile || home" :class="{ 'is-collapsed': !isMobile && !showList, 'sheet-closed': isMobile && !showList }" id="session-list" />
    <div v-if="!isMobile" class="session-list-edge">
      <Hint text="↔"><div v-show="showList" class="list-resize" role="separator" aria-orientation="vertical"
        :aria-label="i18n.t('app.name')" @pointerdown="onListResizePointerDown" /></Hint>
      <!-- The sidebar's own button collapses it; once collapsed, this tab on the edge brings it back. -->
      <SessionListToggle v-if="!showList" />
    </div>
    <div class="content-pane" :class="{ 'sheet-covered': isMobile && showList }">
      <RouterView v-slot="{ Component }">
        <KeepAlive include="StartChat"><component :is="Component" /></KeepAlive>
      </RouterView>
    </div>
  </div>
</template>
