<script setup lang="ts">
import { inject, onMounted } from 'vue';
import { deviceProxyDraftKey } from './useDeviceProxyDraft.ts';
import { tr } from '../../core/i18n/tr.ts';
import SwitchRow from '../../domain/settings/SwitchRow.vue';
const { saved, url, backend, busy, error, applied, dirty, damaged, save, load } = inject(deviceProxyDraftKey)!;
onMounted(load);
</script>
<template>
  <section class="set-section">
    <header class="set-section-head">
      <h3>{{ tr('本机代理', 'Device proxy') }}</h3>
      <p>
        {{
          tr(
            '用于本机浏览器。留空沿用设备默认设置，修改后重启 Wish 生效。',
            'Used by the device browser. Leave blank for the device default. Restart Wish to apply changes.',
          )
        }}
      </p>
    </header>
    <div class="set-card">
      <label class="set-row">
        <span class="set-label"
          ><span>{{ tr('代理地址', 'Proxy URL') }}</span
          ><small>HTTP / SOCKS5</small></span
        >
        <input
          v-model.trim="url"
          class="input"
          type="url"
          placeholder="socks5://127.0.0.1:1080"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :disabled="!saved || busy"
        />
      </label>
      <SwitchRow
        v-model="backend"
        :disabled="!saved || busy || !url"
        :name="tr('连接 Wish 后端时也使用代理', 'Also proxy connections to the Wish server')"
      />
      <div v-if="error || (applied && !dirty)" class="set-row">
        <span v-if="error" role="alert">{{ error }}</span>
        <span v-else-if="applied && !dirty" role="status">{{
          tr('已保存，重启 Wish 后生效。', 'Saved. Restart Wish to apply.')
        }}</span>
        <button v-if="damaged && !dirty" class="btn" :disabled="busy" @click="save">
          {{ tr('重置本机代理', 'Reset device proxy') }}
        </button>
      </div>
    </div>
  </section>
</template>
