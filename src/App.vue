<script setup lang="ts">
import { useMobileNavigationMotion } from './features/shell/useMobileNavigationMotion.ts';
import SessionQuickSwitch from './features/shell/SessionQuickSwitch.vue';
import { rememberSessionVisit } from './features/shell/quickSwitch.ts';
import { archiveRequest, exportRequest } from './features/sessions/sessionPackages.ts';
const ArchiveSessionsDialog = defineAsyncComponent(() => import('./features/sessions/ArchiveSessionsDialog.vue'));
const ExportSessionsDialog = defineAsyncComponent(() => import('./features/sessions/ExportSessionsDialog.vue'));
import Modal from './ui/components/Modal.vue';
import { useMobileBackNavigation } from './features/shell/useMobileBackNavigation.ts';
import HoverHintHost from './ui/components/HoverHintHost.vue';
import { defineAsyncComponent, computed, onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue';
import { TooltipProvider } from 'reka-ui';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { useIsMobile } from './ui/composables/useMedia.ts';
import AttachmentPreview from './ui/components/AttachmentPreview.vue';
import ToastHost from './ui/components/ToastHost.vue';
import ImageSidebar from './domain/media/ImageSidebar.vue';
import TouchSelection from './ui/components/TouchSelection.vue';
import ErrorDialogHost from './ui/components/ErrorDialogHost.vue';
import CachedPage from './ui/components/CachedPage.vue';
import { i18n } from './core/i18n/index.ts';
import { sync } from './core/state/syncSlice.ts';
import { useProviderGate } from './domain/providers/useProviderGate.ts';
import { tr } from './core/i18n/tr.ts';
import { isSignedOut } from './core/connection.ts';
import { accountDialogOpen } from './features/account/accountDialog.ts';
import SignOutButton from './features/connection/SignOutButton.vue';
import { closeOverlayKey } from './ui/composables/overlay.ts';
useMobileNavigationMotion();
const ProviderSetup = defineAsyncComponent(() => import('./features/onboarding/ProviderSetup.vue'));
const ConnectView = defineAsyncComponent(() => import('./features/connection/ConnectView.vue'));
const AccountDialog = defineAsyncComponent(() => import('./features/account/AccountDialog.vue'));
// Signed out, nothing talks to a server until the sign-in page picks one. A server that wants a
// token this browser does not have shows that page too.
const signedOut = isSignedOut();
const gate = signedOut ? null : useProviderGate();
const route = useRoute();
const router = useRouter();
watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') rememberSessionVisit(id);
  },
  { immediate: true },
);
const isMobile = useIsMobile();
// Settings and statistics open over the page they were opened from: a window on a desktop, a page
// of their own on a phone. The page behind stays mounted, and comes back as it was when they close.
const isOverlay = (target: { meta: { section?: string } }) =>
  ['settings', 'stats', 'data'].includes(target.meta.section ?? '');
const sessionsRoute = () => router.resolve('/sessions') as unknown as RouteLocationNormalizedLoaded;
const backgroundRoute = shallowRef(isOverlay(router.currentRoute.value) ? sessionsRoute() : router.currentRoute.value);
const overlayRoute = shallowRef(isOverlay(router.currentRoute.value) ? router.currentRoute.value : undefined);
const overlayVisible = ref(!!overlayRoute.value);
let overlayExitTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => router.currentRoute.value,
  (current) => {
    if (isOverlay(current)) {
      clearTimeout(overlayExitTimer);
      overlayExitTimer = undefined;
      overlayRoute.value = current;
      overlayVisible.value = true;
      if (!backgroundRoute.value.matched.length) backgroundRoute.value = sessionsRoute();
    } else {
      backgroundRoute.value = current;
      if (overlayVisible.value) {
        clearTimeout(overlayExitTimer);
        overlayExitTimer = setTimeout(() => {
          overlayVisible.value = false;
          overlayExitTimer = undefined;
        }, 220);
      }
    }
  },
  { flush: 'sync' },
);
onBeforeUnmount(() => clearTimeout(overlayExitTimer));
provide(closeOverlayKey, () => router.push(backgroundRoute.value.fullPath));
const { exitRequested, confirmExit } = useMobileBackNavigation(router, isMobile, () => backgroundRoute.value.fullPath);
const overlayOpen = computed(() => isOverlay(route));
const online = computed(() => sync.online.value);
</script>

<template>
  <TooltipProvider :delay-duration="450" :skip-delay-duration="150">
    <template v-if="!gate || gate.state.value === 'locked'">
      <ConnectView v-show="!isMobile || route.name !== 'settings'" @settings="router.push('/settings')" />
      <RouterView v-if="route.name === 'settings'" v-slot="{ Component }"
        ><component :is="Component" device-only
      /></RouterView>
    </template>
    <ProviderSetup
      v-else-if="gate.state.value === 'required'"
      @complete="
        async () => {
          await router.replace('/new');
          await gate!.refresh();
        }
      "
    />
    <main v-else-if="gate.state.value !== 'ready'" class="provider-gate-status" aria-live="polite">
      <img class="brand-mark" src="/app-icons/mark.svg" alt="" />
      <p>
        {{
          gate.state.value === 'error'
            ? tr('无法读取服务配置', 'Unable to read server configuration')
            : tr('正在读取配置…', 'Loading configuration…')
        }}
      </p>
      <p v-if="gate.error.value" class="load-error" role="alert">{{ gate.error.value }}</p>
      <div class="provider-gate-actions">
        <button v-if="gate.state.value === 'error'" class="btn" @click="gate!.refresh()">
          {{ tr('重试', 'Retry') }}
        </button>
        <SignOutButton button-class="btn ghost">{{ tr('切换账户', 'Switch account') }}</SignOutButton>
      </div>
    </main>
    <div v-else class="shell" :class="isMobile ? 'mobile' : 'desktop'">
      <SessionQuickSwitch />
      <div class="main">
        <div class="main-col">
          <div v-if="!online" class="offline-banner" role="status">{{ i18n.t('settings.offline') }}</div>
          <RouterView
            v-if="!isOverlay(backgroundRoute)"
            :route="backgroundRoute"
            v-slot="{ Component, route: pageRoute }"
          >
            <KeepAlive :max="4">
              <CachedPage
                v-if="Component"
                v-show="!overlayOpen || !isMobile"
                :key="pageRoute.matched[0].path"
                :view="Component"
                :route="pageRoute"
              />
            </KeepAlive>
          </RouterView>
          <RouterView v-if="overlayRoute" :route="overlayRoute" v-slot="{ Component, route: pageRoute }">
            <KeepAlive
              ><CachedPage
                class="overlay-route-host"
                :class="{ 'is-closing': !overlayOpen }"
                v-if="Component && overlayVisible"
                :key="pageRoute.meta.section"
                :view="Component"
                :route="pageRoute"
            /></KeepAlive>
          </RouterView>
        </div>
      </div>
      <AccountDialog v-if="!isMobile" :open="accountDialogOpen" @close="accountDialogOpen = false" />

      <AttachmentPreview />
      <TouchSelection />
    </div>
    <Modal
      v-if="exitRequested"
      compact
      content-class="exit-confirmation"
      :open="true"
      :back-layer="false"
      :title="tr('退出 Wish？', 'Leave Wish?')"
      @close="exitRequested = false"
    >
      <template #footer>
        <button class="btn" @click="exitRequested = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn primary" @click="confirmExit">{{ tr('退出', 'Leave') }}</button>
      </template>
    </Modal>
    <ArchiveSessionsDialog v-if="archiveRequest" :request="archiveRequest" @close="archiveRequest = null" />
    <ExportSessionsDialog v-if="exportRequest" :request="exportRequest" @close="exportRequest = null" />
    <ImageSidebar />
    <ToastHost />
    <HoverHintHost />
    <!-- Outside the shell so onboarding errors are reported too. -->
    <ErrorDialogHost />
  </TooltipProvider>
</template>

<style>
.provider-gate-status {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  gap: 12px;
  text-align: center;
}
.provider-gate-status .brand-mark {
  display: block;
  width: 64px;
  height: auto;
  margin: 0 0 8px;
}
.provider-gate-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (min-width: 900px) {
  .overlay-route-host {
    display: contents !important;
  }
}
@media (max-width: 899px) {
  .overlay-route-host {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: transparent;
  }
}
.overlay-route-host.is-closing {
  pointer-events: none;
}
.modal-card.exit-confirmation {
  width: min(320px, calc(100vw - 40px));
}
</style>
