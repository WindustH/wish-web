<script setup lang="ts">
import FadeText from '../../ui/components/FadeText.vue';
import { modelLabel } from '../../ui/modelLabel.ts';
import { sessionParent } from "../../ui/sessionNavigation.ts";
import { sessionPanelCloseKey } from '../../ui/composables/sessionPanel.ts';
import Hint from '../../ui/components/Hint.vue';
// Chat surface: top bar (desktop three actions / mobile back+menu), log,
// composer, and child-route dialogs (mobile subpages). Opening session
// actions never rebuilds the conversation.
import { computed, provide, shallowRef, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { i18n } from '../../core/i18n/index.ts';
import { chat } from '../../core/state/chatSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import ChatLog from './ChatLog.vue';
import Composer from './Composer.vue';
import QueueDock from './QueueDock.vue';
import InfoPane from './InfoPane.vue';
import SearchPane from './SearchPane.vue';
import SessionSettingsPane from './SessionSettingsPane.vue';
import ModelSettings from './ModelSettings.vue';
import ReasoningSettings from './ReasoningSettings.vue';
import { useResolvedEffort } from './useResolvedEffort.ts';
import { effortLabel } from './reasoningLabels.ts';

const panelClose = shallowRef<(() => void) | null>(null);
provide(sessionPanelCloseKey, panelClose);
const route = useRoute();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');

const id = computed(() => route.params.id as string);
type SessionTab = 'info' | 'search' | 'settings';
const routeTab = computed<SessionTab | null>(() => {
  const n = route.name as string;
  return n === 'chat-info' ? 'info' : n === 'chat-search' ? 'search' : n === 'chat-settings' ? 'settings' : null;
});
const desktopTab = ref<SessionTab | null>(null);
const tab = computed(() => isMobile.value ? routeTab.value : desktopTab.value);

// Existing mobile/deep links still open the right panel. On desktop the
// panel is local UI state, so normalize a child URL to the session URL once.
watch([isMobile, routeTab, id], ([mobile, child, sessionId]) => {
  if (!mobile && child && sessionId) {
    desktopTab.value = child;
    void router.replace({ name: 'chat', params: { id: sessionId } });
  }
}, { immediate: true });

watch(id, (next) => { if (next) chat.open(next); }, { immediate: true });

watch(chat.missingSessionId, (missingId) => {
  if (missingId && missingId === id.value) {
    void router.replace({ name: 'new-chat' });
  }
});

const snapshot = computed(() => chat.snapshot.value);
const queued = computed(() => chat.deliveries.value);
const composerRef = ref<{ fill: (v: string, attachments?: any[]) => void } | null>(null);
const onQueueEdit = (text: string, attachments?: any[]) => composerRef.value?.fill(text, attachments);
const { effort, error: effortError } = useResolvedEffort(snapshot);
const modelOpen = ref(false);
const reasoningOpen = ref(false);
watch(id, () => { modelOpen.value = false; reasoningOpen.value = false; desktopTab.value = null; });

const closeTab = (ownerPath = route.fullPath) => {
  if (!isMobile.value) { desktopTab.value = null; return; }
  if (router.currentRoute.value.fullPath !== ownerPath) return;
  return router.push({ name: 'chat', params: { id: id.value } });
};
const goTab = (t: SessionTab) => {
  if (!isMobile.value) {
    if (desktopTab.value === t) {
      if (panelClose.value) panelClose.value();
      else desktopTab.value = null;
    }
    else desktopTab.value = t;
  } else if (routeTab.value === t) closeTab();
  else void router.push({ name: `chat-${t}`, params: { id: id.value } });
};
</script>

<template>
  <div class="chat-pane">
    <div class="chatbar">
      <button v-if="isMobile" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')"
        @click="router.push(sessionParent)"><Icon name="arrow-left" /></button>
      <div class="chat-title">
        <span v-if="!snapshot" class="chat-skeleton title-skeleton" :aria-label="i18n.t('sessions.loading')" role="status" /><FadeText v-else class="name" :text="snapshot.name || id.slice(0, 8)" />
        <span v-if="!snapshot" class="chat-skeleton model-skeleton" aria-hidden="true" /><span v-else class="model-selection">
        <Hint :text="i18n.t('model.chipTitle')"><button class="model-chip" :aria-expanded="modelOpen" @click="modelOpen = true">
          <span>{{ modelLabel(snapshot?.model || '') || '—' }}</span>
        </button></Hint>
        <span class="selection-dot" aria-hidden="true">·</span>
        <Hint :text="effortError ? String(effortError) : i18n.t('reasoning.title')"><button class="reasoning-chip" :aria-expanded="reasoningOpen" :aria-label="`${i18n.t('reasoning.title')}：${effortLabel(effort)}`" @click="reasoningOpen = true"><span>{{ effortLabel(effort).toUpperCase() }}</span></button></Hint>
        </span>
      </div>
      <template v-if="!isMobile">
        <Hint :text="i18n.t('chatbar.info')"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.info')"
          :class="{ selected: tab === 'info' }" data-session-panel="info" :aria-pressed="tab === 'info'" @click="goTab('info')"><Icon name="info" /></button></Hint>
        <Hint :text="i18n.t('chatbar.search')"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.search')"
          :class="{ selected: tab === 'search' }" data-session-panel="search" :aria-pressed="tab === 'search'" @click="goTab('search')"><Icon name="search" /></button></Hint>
        <Hint :text="i18n.t('chatbar.settings')"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.settings')"
          :class="{ selected: tab === 'settings' }" data-session-panel="settings" :aria-pressed="tab === 'settings'" @click="goTab('settings')"><Icon name="settings-2" /></button></Hint>
      </template>
      <Menu v-else :items="[
        { key: 'info', label: i18n.t('chatbar.info') },
        { key: 'search', label: i18n.t('chatbar.search') },
        { key: 'settings', label: i18n.t('chatbar.settings') },
      ]" :label="i18n.t('chatbar.more')" @select="goTab($event as SessionTab)">
        <Icon name="ellipsis-vertical" />
      </Menu>
    </div>
    <ChatLog :session-id="id" :mobile="isMobile" />
    <div class="queue-dock-anchor">
      <Transition name="queue-dock">
        <QueueDock v-if="queued.length > 0" :items="queued" :refill="onQueueEdit" />
      </Transition>
    </div>
    <Composer ref="composerRef" :session-id="id" :mobile="isMobile" />
    <RouterView v-slot="{ Component, route: panelRoute }">
      <component :is="Component" v-if="isMobile" :key="panelRoute.fullPath" @close="closeTab(panelRoute.fullPath)" />
    </RouterView>
    <InfoPane v-if="!isMobile && desktopTab === 'info'" @close="desktopTab = null" />
    <SearchPane v-if="!isMobile && desktopTab === 'search'" @close="desktopTab = null" />
    <SessionSettingsPane v-if="!isMobile && desktopTab === 'settings'" @close="desktopTab = null" />
    <ModelSettings v-if="modelOpen" :session-id="id" @close="modelOpen = false" />
    <ReasoningSettings v-if="reasoningOpen" :session-id="id" @close="reasoningOpen = false" />
  </div>
</template>
