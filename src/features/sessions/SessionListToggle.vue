<script setup lang="ts">
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { i18n } from '../../core/i18n/index.ts';

defineOptions({ inheritAttrs: false });
const isMobile = useIsMobile();
const { sessionListCollapsed } = prefs;
const label = computed(() => i18n.t(sessionListCollapsed.value ? 'sessions.expandList' : 'sessions.collapseList'));
</script>

<template>
  <Hint v-if="!isMobile && sessionListCollapsed" :text="label"><button v-bind="$attrs" type="button" class="btn ghost icon-only session-list-toggle" :aria-label="label"
    :aria-expanded="!sessionListCollapsed" aria-controls="session-list"
    @click="prefs.setSessionListCollapsed(!sessionListCollapsed)">
    <Icon name="panel-left" aria-hidden="true" />
  </button></Hint>
</template>
