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
      <div v-if="route.name === 'sessions'" class="session-welcome">
        <span class="welcome-brand">Wish<span>.</span></span>
        <p>{{ i18n.locale.value === 'zh' ? '选择一个会话，继续你的思考。' : 'Choose a conversation. Pick up a thought.' }}</p>
      </div>
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.session-welcome { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; padding: 32px; text-align: center; }
.welcome-brand { font: 500 64px/1.3 var(--display); letter-spacing: -.06em; }
.welcome-brand > span { color: var(--accent); }
.session-welcome p { color: var(--fg-subtle); font-size: 13px; }
</style>
