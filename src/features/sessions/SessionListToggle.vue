<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { i18n } from '../../core/i18n/index.ts';

const { sessionListCollapsed } = prefs;
const label = computed(() => i18n.t(sessionListCollapsed.value ? 'sessions.expandList' : 'sessions.collapseList'));
</script>

<template>
  <Hint :text="label"><button type="button" class="session-list-toggle" :aria-label="label"
    :aria-expanded="!sessionListCollapsed" aria-controls="session-list"
    @click="prefs.setSessionListCollapsed(!sessionListCollapsed)">
    <Icon name="chevron-left" :size="10" aria-hidden="true" />
  </button></Hint>
</template>
