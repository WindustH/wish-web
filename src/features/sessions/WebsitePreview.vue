<script setup lang="ts">
import { ref, watch } from 'vue';
import { openWebsite, closeWebsite } from '../../core/api/endpoints.ts';
import { absUrl } from '../../core/api/client.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import LoadingState from '../../ui/components/LoadingState.vue';
import PageRegion from '../../domain/media/PageRegion.vue';
const props = defineProps<{ session: string; blob: string; name: string; toolbar?: HTMLElement }>();
const source = ref(''),
  error = ref(''),
  loaded = ref(false),
  revision = ref(0),
  frame = ref<HTMLIFrameElement>();
watch(
  [() => props.session, () => props.blob, revision],
  async ([owner, id], _, cleanup) => {
    const controller = new AbortController();
    let grantLabel = '',
      timer: ReturnType<typeof setTimeout> | undefined;
    function revoke() {
      if (!grantLabel) return;
      const label = grantLabel;
      grantLabel = '';
      void closeWebsite(owner, id, label).catch(() => {}); // Expiry handles interrupted connections.
    }
    const receive = (event: MessageEvent) => {
      if (
        !source.value ||
        event.source !== frame.value?.contentWindow ||
        event.origin !== new URL(source.value).origin ||
        event.data?.type !== 'wish-website-loaded'
      )
        return;
      clearTimeout(timer);
      if (event.data.error) {
        error.value =
          event.data.error === 'embedding'
            ? tr(
                '此网站的安全策略禁止在侧栏中嵌入。请检查开发服务的嵌入设置。',
                'This website blocks embedded previews. Check the development server’s framing policy.',
              )
            : event.data.error === 'cookies'
              ? tr(
                  '浏览器未接受预览凭据或预览已过期。可重试，或通过 HTTPS 预览域名打开 Wish。',
                  'Preview credentials were blocked or expired. Retry, or open Wish using its HTTPS preview domain.',
                )
              : tr(
                  '无法连接网站，请确认开发服务已启动。',
                  'Could not connect to the website. Check that the development server is running.',
                );
        source.value = '';
        revoke();
      } else loaded.value = true;
    };
    window.addEventListener('message', receive);
    cleanup(() => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      revoke();
    });
    source.value = '';
    error.value = '';
    loaded.value = false;
    try {
      const url = new URL(absUrl(''));
      const base = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ? 'localhost' : url.hostname;
      if (/^[\d.]+$/.test(base) || base.includes(':'))
        throw new Error(
          tr(
            '请通过配置了预览子域名的 Wish 域名或本机 SSH 网关打开此网站。',
            'Open Wish using a hostname with preview subdomains or the local SSH gateway.',
          ),
        );
      const grant = await openWebsite(owner, id, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!/^ws-[a-f0-9]{32}$/.test(grant.label) || !/^[a-f0-9]{32}$/.test(grant.secret))
        throw new Error('Invalid website preview grant');
      grantLabel = grant.label;
      timer = setTimeout(() => {
        if (!loaded.value) {
          revoke();
          source.value = '';
          error.value = tr(
            '未收到网站响应，请检查预览域名和连接后重试。',
            'No response from the website. Check the preview hostname and connection, then retry.',
          );
        }
      }, 40000);
      url.hostname = grant.label + '.' + base;
      url.pathname = '/.wish-open/' + grant.secret;
      url.search = url.protocol === 'https:' ? '?secure=1' : '?secure=0';
      source.value = url.href;
    } catch (e) {
      if (!controller.signal.aborted) error.value = describeError(e).message;
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="website-stage">
    <div v-if="error" class="website-error" role="alert">
      {{ error }} <button class="btn sm" @click="revision++">{{ tr('重试', 'Retry') }}</button>
    </div>
    <iframe
      v-if="source"
      ref="frame"
      :src="source"
      :title="name"
      referrerpolicy="no-referrer"
      sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock"
    />
    <LoadingState v-if="!error && !loaded" class="website-loading" :label="tr('正在加载网站…', 'Loading website…')" />
    <PageRegion
      v-if="loaded && frame"
      :element="frame"
      :session="session"
      :blob="blob"
      :name="name"
      :toolbar="toolbar"
    />
  </div>
</template>
<style scoped>
.website-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
}
iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: white;
}
.website-loading,
.website-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 8px;
  background: var(--bg);
  padding: 16px;
}
</style>
