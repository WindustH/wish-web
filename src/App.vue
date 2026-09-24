<script setup lang="ts">
import { useMobileNavigationMotion } from './ui/composables/useMobileNavigationMotion';
useMobileNavigationMotion();
import Hint from './ui/components/Hint.vue';
import HoverHintHost from './ui/components/HoverHintHost.vue';
import { defineAsyncComponent, computed, onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue';
import { TooltipProvider, DialogRoot, DialogPortal, DialogContent, DialogTitle } from 'reka-ui';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { useMedia } from './ui/composables/useMedia.js';
import Icon from './ui/components/Icon.vue';
import AttachmentPreview from './ui/components/AttachmentPreview.vue';
import ToastHost from './ui/components/ToastHost.vue';
import CachedPage from './ui/components/CachedPage.vue';
import { i18n } from './core/i18n/index.js';
import { sync } from './core/state/syncSlice.js';
import { needRefresh, refreshApp } from './ui/pwa.js';
import { useProviderGate } from './ui/composables/useProviderGate';
import { tr } from './core/i18n/tr';
import { sessionLocation } from './ui/sessionNavigation';

const ProviderSetup = defineAsyncComponent(() => import('./features/onboarding/ProviderSetup.vue'));
const gate = useProviderGate();
const route = useRoute();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');
const backgroundRoute = shallowRef(router.currentRoute.value.meta.section === 'settings' ? router.resolve('/sessions') as unknown as RouteLocationNormalizedLoaded : router.currentRoute.value);
const settingsRoute = shallowRef(router.currentRoute.value.meta.section === 'settings' ? router.currentRoute.value : undefined);
const settingsVisible = ref(!!settingsRoute.value);
let settingsExitTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => router.currentRoute.value, current => {
  if (current.meta.section === 'settings') {
    clearTimeout(settingsExitTimer);
    settingsExitTimer = undefined;
    settingsRoute.value = current;
    settingsVisible.value = true;
    if (!backgroundRoute.value.matched.length) backgroundRoute.value = router.resolve('/sessions') as unknown as RouteLocationNormalizedLoaded;
  }
  else {
    backgroundRoute.value = current;
    if (settingsVisible.value) {
      clearTimeout(settingsExitTimer);
      settingsExitTimer = setTimeout(() => { settingsVisible.value = false; settingsExitTimer = undefined; }, 220);
    }
  }
}, { flush: 'sync' });
onBeforeUnmount(() => clearTimeout(settingsExitTimer));
provide('closeSettings', () => router.push(backgroundRoute.value.fullPath));
const settingsOpen = computed(() => route.meta.section === 'settings');
const online = computed(() => sync.online.value);

const nav = [
  { id: 'sessions', icon: 'message-circle', path: '/sessions', label: () => i18n.t('nav.sessions') },
  { id: 'stats', icon: 'chart-column', path: '/stats', label: () => i18n.t('nav.stats') },
  { id: 'settings', icon: 'settings', path: '/settings', label: () => i18n.t('nav.settings'), bottom: true },
];
const top = nav.filter((n) => !n.bottom);
const isActive = (section: string) => section !== 'settings' && (settingsOpen.value ? backgroundRoute.value.meta.section : route.meta.section) === section;
const go = (item: typeof nav[number]) => router.push(item.id === 'sessions' ? sessionLocation.value : item.path);
</script>

<template>
  <TooltipProvider :delay-duration="450" :skip-delay-duration="150">
  <ProviderSetup v-if="gate.state.value === 'required'" @complete="async () => { await router.replace('/new'); await gate.refresh(); }" />
  <main v-else-if="gate.state.value !== 'ready'" class="provider-gate-status" aria-live="polite">
    <span class="brand-mark">w<span>.</span></span>
    <p>{{ gate.state.value === 'error' ? tr('无法读取服务配置', 'Unable to read server configuration') : tr('正在读取配置…', 'Loading configuration…') }}</p>
    <p v-if="gate.error.value" class="load-error" role="alert">{{ gate.error.value }}</p>
    <button v-if="gate.state.value === 'error'" class="btn" @click="gate.refresh()">{{tr('重试', 'Retry')}}</button>
  </main>
  <div v-else class="shell" :class="isMobile ? 'mobile' : 'desktop'">
    <nav class="vbar" :aria-label="i18n.t('app.name')">
      <RouterLink :to="sessionLocation" class="brand-mark" aria-label="Wish">w<span>.</span></RouterLink>
      <Hint :text="item.label()" v-for="item in top" :key="item.id"><button class="nav-btn" :class="{ active: isActive(item.id) }"
        :aria-current="isActive(item.id) ? 'page' : undefined" :aria-label="item.label()" @click="go(item)">
        <Icon :name="item.icon" />
      </button></Hint>
      <div class="spacer" />
      <Hint :text="item.label()" v-for="item in nav.filter((n) => n.bottom)" :key="item.id"><button class="nav-btn"
        :aria-expanded="settingsOpen" aria-haspopup="dialog" :aria-label="item.label()"
        @click="go(item)">
        <Icon :name="item.icon" />
      </button></Hint>
    </nav>
    <div class="main">
      <div class="main-col">
        <header v-if="isMobile && route.meta.section === 'stats'" class="mobile-secondary-header">
          <button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')" @click="router.push('/sessions')"><Icon name="arrow-left" /></button>
          <span>{{ i18n.t(route.meta.section === 'stats' ? 'nav.stats' : 'nav.settings') }}</span>
        </header>
        <div v-if="!online" class="offline-banner" role="status">{{ i18n.t('settings.offline') }}</div>
        <RouterView v-if="backgroundRoute.meta.section !== 'settings'" :route="backgroundRoute" v-slot="{ Component, route: pageRoute }">
          <KeepAlive :max="4">
            <CachedPage v-if="Component" v-show="!settingsOpen || !isMobile" :key="pageRoute.matched[0].path" :view="Component" :route="pageRoute" />
          </KeepAlive>
        </RouterView>
        <RouterView v-if="settingsRoute" :route="settingsRoute" v-slot="{ Component, route: pageRoute }">
          <KeepAlive><CachedPage class="settings-route-host" :class="{ 'is-closing': !settingsOpen }" v-if="Component && settingsVisible" :view="Component" :route="pageRoute" /></KeepAlive>
        </RouterView>
      </div>
    </div>
    <DialogRoot v-model:open="needRefresh" :modal="false"><DialogPortal>
    <DialogContent class="pwa-update" :aria-describedby="undefined" @interact-outside.prevent @open-auto-focus.prevent>
      <DialogTitle as-child><span>{{ i18n.t('pwa.updateAvailable') }}</span></DialogTitle>
      <button class="btn" @click="refreshApp()">{{ i18n.t('pwa.reload') }}</button>
      <button class="btn ghost" @click="needRefresh = false">{{ i18n.t('pwa.later') }}</button>
    </DialogContent>
    </DialogPortal></DialogRoot>
    <ToastHost />
    <AttachmentPreview />
  </div>
  <HoverHintHost />
  </TooltipProvider>
</template>

<style>
.provider-gate-status { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px; gap:12px; text-align:center; }
@media (min-width: 900px) { .settings-route-host { display: contents !important; } }
@media (max-width: 899px) { .settings-route-host { position: absolute; inset: 0; z-index: 30; background: transparent; } }
.settings-route-host.is-closing { pointer-events: none; }
</style>
