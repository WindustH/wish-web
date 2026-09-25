<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { useSettingsReturn } from './settingsReturn.ts';
import { tr } from './fields.ts';

type ProxyConfig = {
  mode: 'environment' | 'manual' | 'direct';
  url: string;
  username: string;
  password: string;
};

const props = defineProps<{ value: ProxyConfig; environment: { name: string; value: string; redacted: boolean }[] }>();

const modes = computed(() => [
  { value: 'environment', label: tr('系统环境变量', 'Environment variables') },
  { value: 'manual', label: tr('手动配置', 'Manual proxy') },
  { value: 'direct', label: tr('直连', 'Direct connection') },
]);
const modeLabel = computed(() => modes.value.find(mode => mode.value === props.value.mode)?.label ?? props.value.mode);
// On phones the fields get their own page, like every other group of settings.
const mobile = useMedia('(max-width: 899px)');
const open = ref(false);
const returns = useSettingsReturn(() => mobile.value && open.value, async () => { if (await returns.confirm()) open.value = false; });
</script>

<template>
  <div v-if="mobile" class="mobile-settings-list"><button type="button" class="mobile-settings-row" @click="open = true"><span>{{ tr('代理', 'Proxy') }}</span><small>{{ modeLabel }}</small><Icon name="chevron-right" /></button></div>
  <component :is="mobile ? Modal : 'div'" v-bind="mobile ? { page: true, open, title: tr('网络代理', 'Network proxy'), contentClass: 'mobile-settings-page', beforeClose: returns.confirm } : { class: 'set-card' }" @close="open = false">
    <div :class="mobile ? 'set-card' : 'proxy-fields'">
      <label class="set-row"><span class="set-label"><span>{{ tr('代理模式', 'Proxy mode') }}</span><small>{{ tr('提供商请求如何连接网络', 'How provider requests reach the network') }}</small></span><SelectField mobile-page v-model="value.mode" :options="modes" /></label>
      <div v-if="value.mode === 'environment'" class="set-row stacked proxy-environment">
        <div v-for="item in environment" :key="item.name" class="proxy-environment-row"><code>{{ item.name }}</code><span>{{ item.value }}<small v-if="item.redacted">{{ tr('（敏感部分已隐藏）', ' (sensitive details hidden)') }}</small></span></div>
        <p v-if="!environment.length" class="proxy-empty">{{ tr('服务器上没有设置代理环境变量，请求将直连。', 'No proxy environment variables are set on the server; requests connect directly.') }}</p>
      </div>
      <template v-else-if="value.mode === 'manual'">
        <label class="set-row"><span class="set-label"><span>{{ tr('代理地址', 'Proxy URL') }}</span><small>{{ tr('http:// 或 https:// 开头', 'Starts with http:// or https://') }}</small></span><input class="input set-mono" v-model.trim="value.url" type="url" placeholder="http://127.0.0.1:7890" autocomplete="off" spellcheck="false" /></label>
        <label class="set-row"><span class="set-label"><span>{{ tr('用户名', 'Username') }}</span><small>{{ tr('可选', 'Optional') }}</small></span><input class="input" v-model="value.username" autocomplete="off" spellcheck="false" /></label>
        <label class="set-row"><span class="set-label"><span>{{ tr('密码', 'Password') }}</span><small>{{ tr('可选', 'Optional') }}</small></span><span class="proxy-password"><input class="input" type="password" :value="value.password === '<redacted>' ? '' : value.password" :placeholder="value.password === '<redacted>' ? tr('已配置，留空保留', 'Configured; leave blank to retain') : ''" autocomplete="new-password" @input="value.password = ($event.target as HTMLInputElement).value" /><button v-if="value.password" class="btn ghost" type="button" @click="value.password = ''">{{ tr('清除', 'Clear') }}</button></span></label>
      </template>
    </div>
  </component>
</template>

<style scoped>
.proxy-password { display: flex; gap: 8px; min-width: 0; }
.proxy-password .input { flex: 1; min-width: 0; }
.proxy-password .btn { flex: none; }
.proxy-environment { gap: 8px; }
.proxy-environment-row { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 12px; align-items: baseline; font-size: 12px; }
.proxy-environment-row code { font-family: var(--mono); color: var(--fg-muted); }
.proxy-environment-row span { font-family: var(--mono); overflow-wrap: anywhere; }
.proxy-environment-row small { font-family: var(--font); color: var(--fg-subtle); }
.proxy-empty { margin: 0; font-size: 12px; color: var(--fg-subtle); }
</style>
