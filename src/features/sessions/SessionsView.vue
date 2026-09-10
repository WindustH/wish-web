<script setup lang="ts">
// Two-pane shell (desktop): the session list stays mounted while the right
// side routes between (empty) and chat; chat stays mounted while its
// info/search/manage child routes change. Mobile: list and chat are
// exclusive full views.
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useMedia } from '../../ui/composables/useMedia.js';
import SessionList from './SessionList.vue';
import { applySavedListWidth, onListResizePointerDown } from './listWidth.js';
import { i18n } from '../../core/i18n/index.js';

const route = useRoute();
const isMobile = useMedia('(max-width: 899px)');
const showList = computed(() => isMobile.value ? route.name === 'sessions' : true);

onMounted(applySavedListWidth);
</script>

<template>
  <div class="sessions-split">
    <template v-if="showList">
      <SessionList />
      <div v-if="!isMobile" class="list-resize" role="separator" aria-orientation="vertical"
        :aria-label="i18n.t('app.name')" title="↔" @pointerdown="onListResizePointerDown" />
    </template>
    <div v-if="!isMobile || !showList" class="content-pane">
      <RouterView />
    </div>
  </div>
</template>
