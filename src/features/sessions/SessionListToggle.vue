<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { prefs } from '../../core/state/prefsSlice.js';
import { i18n } from '../../core/i18n/index.js';

const { sessionListCollapsed } = prefs;
const label = computed(() => i18n.t(sessionListCollapsed.value ? 'sessions.expandList' : 'sessions.collapseList'));
</script>

<template>
  <Hint :text="label"><button type="button" class="session-list-toggle" :aria-label="label"
    :aria-expanded="!sessionListCollapsed" aria-controls="session-list"
    @click="prefs.setSessionListCollapsed(!sessionListCollapsed)">
    <component :is="sessionListCollapsed ? ChevronRight : ChevronLeft" :size="12" aria-hidden="true" />
  </button></Hint>
</template>
