<script setup lang="ts">
import SelectField from '../../ui/components/SelectField.vue';
import { tr } from './fields';

type ProxyConfig = {
  mode: 'environment' | 'manual' | 'direct';
  url: string;
  username: string;
  password: string;
};

defineProps<{ value: ProxyConfig; environment: { name: string; value: string; redacted: boolean }[] }>();

const modes = [
  { value: 'environment', label: tr('系统环境变量', 'Environment variables') },
  { value: 'manual', label: tr('手动配置', 'Manual proxy') },
  { value: 'direct', label: tr('直连', 'Direct connection') },
];
</script>

<template>
  <section class="server-proxy-settings">
    <h2>{{ tr('代理', 'Proxy') }}</h2>
    <div class="proxy-fields">
      <label>{{ tr('代理模式', 'Proxy mode') }}<SelectField mobile-page v-model="value.mode" :options="modes" /></label>
      <div v-if="value.mode==='environment'" class="proxy-environment">
        <div v-for="item in environment" :key="item.name" class="proxy-environment-row"><code>{{ item.name }}</code><span>{{ item.value }}<small v-if="item.redacted">{{ tr('（敏感部分已隐藏）', ' (sensitive details hidden)') }}</small></span></div>
        <p v-if="!environment.length" class="proxy-empty">{{ tr('未读取到代理环境变量', 'No proxy environment variables found') }}</p>
      </div>
      <template v-else-if="value.mode==='manual'">
        <label>{{ tr('代理地址', 'Proxy URL') }}<input class="input" v-model.trim="value.url" type="url" placeholder="http://127.0.0.1:7890" autocomplete="off" spellcheck="false" /></label>
        <label>{{ tr('用户名（可选）', 'Username (optional)') }}<input class="input" v-model="value.username" autocomplete="off" spellcheck="false" /></label>
        <label>{{ tr('密码（可选）', 'Password (optional)') }}<span class="proxy-password"><input class="input" type="password" :value="value.password==='<redacted>'?'':value.password" :placeholder="value.password==='<redacted>'?tr('已配置，留空保留','Configured; leave blank to retain'):''" autocomplete="new-password" @input="value.password=($event.target as HTMLInputElement).value" /><button v-if="value.password" class="btn ghost" type="button" @click="value.password=''">{{ tr('清除', 'Clear') }}</button></span></label>
      </template>
    </div>
  </section>
</template>

<style scoped>
.server-proxy-settings { padding: 16px; margin-bottom: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-control); }
.server-proxy-settings h2 { margin: 0 0 14px; font-size: 14px; }
.proxy-fields { display: grid; gap: 12px; }
.proxy-fields label { display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: center; gap: 12px; min-width: 0; font-size: 13px; }
.proxy-fields input { width: 100%; min-width: 0; }
.proxy-password { display: flex; gap: 8px; min-width: 0; }
.proxy-password .btn { flex: none; }
.proxy-environment { display: grid; gap: 8px; padding: 0 0 0 182px; min-width: 0; }
.proxy-environment-row { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 12px; align-items: baseline; font-size: 12px; }
.proxy-environment-row code { font-family: var(--mono); color: var(--fg-muted); }
.proxy-environment-row span { font-family: var(--mono); overflow-wrap: anywhere; }
.proxy-environment-row small { font-family: var(--font); color: var(--fg-subtle); }
.proxy-empty { margin: 0; font-size: 12px; color: var(--fg-subtle); }
@media (max-width: 899px) {
  .server-proxy-settings { background: var(--bg-raised); padding: 14px; }
  .proxy-fields label { grid-template-columns: minmax(0, 1fr); gap: 7px; }
  .proxy-environment { padding-left: 0; }
}
</style>
