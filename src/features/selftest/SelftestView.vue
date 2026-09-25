<script setup lang="ts">
// Connection diagnostics as a page of its own, for direct links and automation
// (`/#/selftest?auto=1` runs at once). The same checks live in Settings → Debug.
import { useRoute, useRouter } from 'vue-router';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import ConnectionDiagnostics from './ConnectionDiagnostics.vue';

const route = useRoute();
const router = useRouter();
// Opened from within the app, go back there; opened directly, go home.
const leave = () => (window.history.state?.back ? router.back() : router.push('/sessions'));
</script>

<template>
  <div class="page selftest-page">
    <header class="page-head">
      <button class="btn ghost icon-only" :aria-label="tr('返回', 'Back')" @click="leave"><Icon name="arrow-left" /></button>
      <h1>{{ tr('连接诊断', 'Connection diagnostics') }}</h1>
    </header>
    <div class="selftest-body">
      <ConnectionDiagnostics :auto-run="route.query.auto === '1'" />
    </div>
  </div>
</template>

<style scoped>
.selftest-body { width: min(100%, 720px); margin: 0 auto; padding: 32px; }
@media (max-width: 899px) { .selftest-body { padding: 16px; } }
</style>
