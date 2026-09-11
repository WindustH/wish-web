<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMedia } from './ui/composables/useMedia.js';
import Icon from './ui/components/Icon.vue';
import ToastHost from './ui/components/ToastHost.vue';
import NewSessionModal from './features/sessions/NewSessionModal.vue';
import { i18n } from './core/i18n/index.js';
import { sync } from './core/state/syncSlice.js';
import { needRefresh, refreshApp } from './ui/pwa.js';
import { sessionLocation } from './router.js';

const route = useRoute();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');
const online = computed(() => sync.online.value);

const nav = [
  { id: 'sessions', icon: 'message-circle', path: '/sessions', label: () => i18n.t('nav.sessions') },
  { id: 'stats', icon: 'chart-column', path: '/stats', label: () => i18n.t('nav.stats') },
  { id: 'settings', icon: 'settings', path: '/settings', label: () => i18n.t('nav.settings'), bottom: true },
];
const top = nav.filter((n) => !n.bottom);
const isActive = (section: string) => route.meta.section === section;
const go = (item: typeof nav[number]) => router.push(item.id === 'sessions' ? sessionLocation.value : item.path);
</script>

<template>
  <div class="shell" :class="isMobile ? 'mobile' : 'desktop'">
    <nav class="vbar" :aria-label="i18n.t('app.name')">
      <RouterLink :to="sessionLocation" class="brand-mark" aria-label="Wish">w<span>.</span></RouterLink>
      <button v-for="item in top" :key="item.id" class="nav-btn" :class="{ active: isActive(item.id) }"
        :aria-current="isActive(item.id) ? 'page' : undefined" :title="item.label()" :aria-label="item.label()" @click="go(item)">
        <Icon :name="item.icon" /><span class="nav-label">{{ item.label() }}</span>
      </button>
      <div class="spacer" />
      <button v-for="item in nav.filter((n) => n.bottom)" :key="item.id" class="nav-btn"
        :class="{ active: isActive(item.id) }" :aria-current="isActive(item.id) ? 'page' : undefined" :title="item.label()" :aria-label="item.label()"
        @click="go(item)">
        <Icon :name="item.icon" /><span class="nav-label">{{ item.label() }}</span>
      </button>
    </nav>
    <div class="main">
      <div class="main-col">
        <div v-if="!online" class="offline-banner" role="status">{{ i18n.t('settings.offline') }}</div>
        <RouterView />
      </div>
    </div>
    <nav class="bbar" :aria-label="i18n.t('app.name')">
      <button v-for="item in nav" :key="item.id" class="nav-btn" :class="{ active: isActive(item.id) }"
        :aria-current="isActive(item.id) ? 'page' : undefined" :aria-label="item.label()" @click="go(item)">
        <Icon :name="item.icon" /><span class="nav-label">{{ item.label() }}</span>
      </button>
    </nav>
    <div v-if="needRefresh" class="pwa-update" role="alert">
      <span>{{ i18n.t('pwa.updateAvailable') }}</span>
      <button class="btn" @click="refreshApp()">{{ i18n.t('pwa.reload') }}</button>
      <button class="btn ghost" @click="needRefresh = false">{{ i18n.t('pwa.later') }}</button>
    </div>
    <NewSessionModal />
    <ToastHost />
  </div>
</template>
