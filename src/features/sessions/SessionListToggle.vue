<script setup lang="ts">
import { computed } from 'vue';
import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue';
import { prefs } from '../../core/state/prefsSlice.js';
import { i18n } from '../../core/i18n/index.js';

const { sessionListCollapsed } = prefs;
const label = computed(() => i18n.t(sessionListCollapsed.value ? 'sessions.expandList' : 'sessions.collapseList'));
</script>

<template>
  <button type="button" class="btn ghost icon-only session-list-toggle" :title="label" :aria-label="label"
    :aria-expanded="!sessionListCollapsed" aria-controls="session-list"
    @click="prefs.setSessionListCollapsed(!sessionListCollapsed)">
    <component :is="sessionListCollapsed ? PanelLeftOpen : PanelLeftClose" :size="20" aria-hidden="true" />
  </button>
</template>
