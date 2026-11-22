<script setup lang="ts">
import { inject } from 'vue';
import { configDraftKey } from './useConfigDraft.ts';
import { tr } from '../../core/i18n/tr.ts';
import DeviceProxySettings from './DeviceProxySettings.vue';
import { isNativeApp } from '../../platform/native.ts';
defineProps<{ server: boolean }>();
import ServerProxySettings from './ServerProxySettings.vue';
const { draft, proxyEnvironment } = inject(configDraftKey)!;
</script>
<template>
  <DeviceProxySettings v-if="isNativeApp()" />
  <section v-if="server && draft.proxy" class="set-section">
    <header class="set-section-head">
      <h3>{{ tr('服务器代理', 'Server proxy') }}</h3>
      <p>
        {{
          tr(
            '各服务共用此代理，可在各自的配置中单独关闭。',
            'Services share this proxy and can opt out in their own settings.',
          )
        }}
      </p>
    </header>
    <ServerProxySettings :value="draft.proxy" :environment="proxyEnvironment" />
  </section>
</template>
