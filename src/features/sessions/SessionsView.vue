<script setup lang="ts">
import { useSessionMotion } from "./useSessionMotion";
useSessionMotion();
import Hint from '../../ui/components/Hint.vue';
// Two-pane shell (desktop): the session list stays mounted while the right
// side routes between (empty) and chat; chat stays mounted while its
// info/search/manage child routes change. Mobile: list and chat are
// exclusive full views.
import { computed, onBeforeUnmount, onDeactivated, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMedia } from '../../ui/composables/useMedia.js';
import SessionList from './SessionList.vue';
import SessionListToggle from './SessionListToggle.vue';
import { prefs } from '../../core/state/prefsSlice.js';
import { applySavedListWidth, cancelListResize, onListResizePointerDown } from './listWidth.js';
import { i18n } from '../../core/i18n/index.js';

const route = useRoute();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');
const showList = computed(() => isMobile.value ? route.name === 'all-sessions' : !prefs.sessionListCollapsed.value);

watch([isMobile, () => route.name], ([mobile, name]) => {
  if (!mobile && name === 'all-sessions') void router.replace('/sessions');
}, { immediate: true });
onMounted(applySavedListWidth);
onDeactivated(cancelListResize);
onBeforeUnmount(cancelListResize);
</script>

<template>
  <div class="sessions-split">
    <template v-if="!isMobile || showList">
      <SessionList v-show="!isMobile || showList" :class="{ 'is-collapsed': !isMobile && !showList }" id="session-list" />
    </template>
    <div v-if="!isMobile" class="session-list-edge">
      <Hint text="↔"><div v-show="showList" class="list-resize" role="separator" aria-orientation="vertical"
        :aria-label="i18n.t('app.name')" @pointerdown="onListResizePointerDown" /></Hint>
      <SessionListToggle />
    </div>
    <div v-show="!isMobile || !showList" class="content-pane">
      <RouterView v-slot="{ Component }">
        <KeepAlive include="StartChat"><component :is="Component" /></KeepAlive>
      </RouterView>
    </div>
  </div>
</template>
