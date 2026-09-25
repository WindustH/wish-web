<script setup lang="ts">
// The sign-in page after signing out: which Wish server to use, and its token.
import { ref } from 'vue';
import Wordmark from '../../ui/components/Wordmark.vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr';
import { checkConnection, connect, lastAddress } from '../../core/connection';

const address = ref(lastAddress());
const token = ref('');
const error = ref('');
const busy = ref(false);
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await checkConnection(address.value, token.value.trim());
    connect(address.value, token.value.trim());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    busy.value = false;
  }
}
</script>

<template>
  <main class="connect-view">
    <form class="connect-card" @submit.prevent="submit">
      <div class="connect-brand" aria-hidden="true"><img src="/app-icons/mark.svg" alt="" /><Wordmark class="connect-wordmark" /></div>
      <h1>{{ tr('连接到 Wish 服务器', 'Connect to a Wish server') }}</h1>
      <p class="connect-intro">{{ tr('地址留空即连接提供此页面的服务器。', 'Leave the address empty to use the server that provides this page.') }}</p>
      <label class="connect-field">
        <span>{{ tr('服务器地址', 'Server address') }}</span>
        <input v-model="address" class="input" type="text" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false" :placeholder="tr('例如 https://wish.example.com', 'e.g. https://wish.example.com')" />
      </label>
      <label class="connect-field">
        <span>{{ tr('访问令牌', 'Access token') }}</span>
        <input v-model="token" class="input" type="password" autocomplete="current-password" :placeholder="tr('服务器未设置访问令牌时留空', 'Leave empty if the server has none')" />
      </label>
      <p v-if="error" class="connect-error" role="alert"><Icon name="triangle-alert" />{{ error }}</p>
      <button type="submit" class="btn primary connect-submit" :disabled="busy"><Icon v-if="busy" name="loader-circle" class="spin" />{{ busy ? tr('正在连接…', 'Connecting…') : tr('连接', 'Connect') }}</button>
      <p class="connect-note">{{ tr('访问令牌保存在这个浏览器中，退出时清除。', 'The access token is kept in this browser and removed when you sign out.') }}</p>
    </form>
  </main>
</template>

<style>
.connect-view { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 32px 16px; background: var(--bg); }
.connect-card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 16px; }
.connect-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.connect-brand img { display: block; width: 52px; height: auto; }
.connect-wordmark { height: 30px; color: var(--fg); }
.connect-card h1 { margin: 0; font: 600 22px/1.35 var(--display); color: var(--fg); }
.connect-intro { margin: -8px 0 4px; font-size: 13px; line-height: 1.6; color: var(--fg-subtle); }
.connect-field { display: flex; flex-direction: column; gap: 8px; font-size: 13px; font-weight: 500; color: var(--fg); }
.connect-field .input { width: 100%; min-height: 44px; font-weight: 400; }
.connect-error { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--err) 35%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--err) 8%, transparent); font-size: 13px; line-height: 1.6; color: var(--err); }
.connect-error .icon { flex: none; width: 16px; height: 16px; margin-top: 3px; }
.connect-submit { min-height: 44px; margin-top: 4px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.connect-submit .icon { width: 16px; height: 16px; }
.connect-note { margin: 0; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); text-align: center; }
</style>
