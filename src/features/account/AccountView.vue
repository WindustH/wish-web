<script setup lang="ts">
// Account status as a page of its own, opened from the phone home screen.
import { onActivated, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import AccountRefresh from './AccountRefresh.vue';
import AccountStatus from './AccountStatus.vue';
import { useAccountStates } from './useAccountStates.ts';

const router = useRouter();
// Opened from within the app, go back there; opened directly, go home.
const leave = () => (window.history.state?.back ? router.back() : router.push('/sessions'));
const { rows, unconfigured, loading, error, checkedAt, refresh } = useAccountStates();
let lastRefresh = 0;
const load = () => { lastRefresh = Date.now(); void refresh(); };
onMounted(load);
// A kept-alive page reads again when shown after a while.
onActivated(() => { if (Date.now() - lastRefresh > 30_000) load(); });
</script>

<template>
  <div class="page account-page">
    <header class="page-head">
      <button class="btn ghost icon-only" :aria-label="tr('返回', 'Back')" @click="leave"><Icon name="arrow-left" /></button>
      <h1>{{ tr('账户状态', 'Account status') }}</h1>
      <div class="account-page-actions"><AccountRefresh :checked-at="checkedAt" :loading="loading" @refresh="load" /></div>
    </header>
    <div class="account-page-body"><AccountStatus :rows="rows" :unconfigured="unconfigured" :loading="loading" :error="error" /></div>
  </div>
</template>

<style scoped>
.account-page .page-head { flex-wrap: nowrap; }
.account-page .page-head h1 { flex: 1; min-width: 0; }
.account-page-actions { display: flex; flex: none; align-items: center; gap: 4px; }
.account-page-body { width: min(100%, 640px); margin: 0 auto; padding: 24px 32px 32px; }
@media (max-width: 899px) { .account-page-body { padding: 16px 16px 24px; } }
</style>
