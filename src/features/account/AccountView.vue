<script setup lang="ts">
// Account status as a page of its own, opened from the phone home screen.
import { useRouter } from 'vue-router';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import AccountStatus from './AccountStatus.vue';

const router = useRouter();
// Opened from within the app, go back there; opened directly, go home.
const leave = () => (window.history.state?.back ? router.back() : router.push('/sessions'));
</script>

<template>
  <div class="page account-page">
    <header class="page-head">
      <button class="btn ghost icon-only" :aria-label="tr('返回', 'Back')" @click="leave"><Icon name="arrow-left" /></button>
      <h1>{{ tr('账户状态', 'Account status') }}</h1>
    </header>
    <div class="account-page-body"><AccountStatus /></div>
  </div>
</template>

<style scoped>
.account-page-body { width: min(100%, 640px); margin: 0 auto; padding: 24px 32px 32px; }
@media (max-width: 899px) { .account-page-body { padding: 12px 16px 24px; } }
</style>
