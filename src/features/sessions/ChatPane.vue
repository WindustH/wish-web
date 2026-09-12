<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
// Chat surface: top bar (desktop three actions / mobile back+menu), log,
// composer, and child-route dialogs (mobile subpages). Opening session
// actions never rebuilds the conversation.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMedia } from '../../ui/composables/useMedia.js';
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import ChatLog from './ChatLog.vue';
import Composer from './Composer.vue';
import ModelSettings from './ModelSettings.vue';
import ReasoningSettings from './ReasoningSettings.vue';
import { useResolvedEffort } from './useResolvedEffort';
import { effortLabel } from './reasoningLabels';

const route = useRoute();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');

const id = computed(() => route.params.id as string);
const tab = computed(() => {
  const n = route.name as string;
  return n === 'chat-info' ? 'info' : n === 'chat-search' ? 'search' : n === 'chat-manage' ? 'manage' : null;
});

watch(id, (next) => { if (next) chat.open(next); }, { immediate: true });

const snapshot = computed(() => chat.snapshot.value);
const { effort, error: effortError } = useResolvedEffort(snapshot);
const queue = computed(() => snapshot.value?.queue ?? 0);
const modelOpen = ref(false);
const reasoningOpen = ref(false);
watch(id, () => { modelOpen.value = false; reasoningOpen.value = false; });

const closeTab = () => router.push({ name: 'chat', params: { id: id.value } });
const goTab = (t: string) => tab.value === t ? closeTab() : router.push({ name: `chat-${t}`, params: { id: id.value } });
</script>

<template>
  <div class="chat-pane">
    <div class="chatbar">
      <button v-if="isMobile" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')"
        @click="router.push('/sessions')"><Icon name="arrow-left" /></button>
      <div class="chat-title">
        <span class="name">{{ snapshot?.name || id.slice(0, 8) }}</span>
        <span v-if="queue > 0" class="queue-badge">{{ i18n.t('chat.queuedN', { n: queue }) }}</span>
        <span class="model-selection">
        <Hint :text="i18n.t('model.chipTitle')"><button class="model-chip" :aria-expanded="modelOpen" @click="modelOpen = true">
          <span>{{ snapshot?.model?.replace(/[-_]/g, ' ').toUpperCase() || '—' }}</span>
        </button></Hint>
        <span class="selection-dot" aria-hidden="true">·</span>
        <Hint :text="effortError ? String(effortError) : i18n.t('reasoning.title')"><button class="reasoning-chip" :aria-expanded="reasoningOpen" :aria-label="`${i18n.t('reasoning.title')}：${effortLabel(effort)}`" @click="reasoningOpen = true"><span>{{ effortLabel(effort).toUpperCase() }}</span></button></Hint>
        </span>
      </div>
      <template v-if="!isMobile">
        <Hint :text="i18n.t('chatbar.info')"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.info')"
          :class="{ selected: tab === 'info' }" :aria-pressed="tab === 'info'" @click="goTab('info')"><Icon name="info" /></button></Hint>
        <Hint :text="i18n.t('chatbar.search')"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.search')"
          :class="{ selected: tab === 'search' }" :aria-pressed="tab === 'search'" @click="goTab('search')"><Icon name="search" /></button></Hint>
        <Hint :text="i18n.t('chatbar.manage')"><button class="btn ghost icon-only" :aria-label="i18n.t('chatbar.manage')"
          :class="{ selected: tab === 'manage' }" :aria-pressed="tab === 'manage'" @click="goTab('manage')"><Icon name="settings-2" /></button></Hint>
      </template>
      <Menu v-else :items="[
        { key: 'info', label: i18n.t('chatbar.info') },
        { key: 'search', label: i18n.t('chatbar.search') },
        { key: 'manage', label: i18n.t('chatbar.manage') },
      ]" :label="i18n.t('chatbar.more')" @select="goTab">
        <Icon name="ellipsis-vertical" />
      </Menu>
    </div>
    <ChatLog :session-id="id" :mobile="isMobile" />
    <Composer :session-id="id" :mobile="isMobile" :on-search="() => goTab('search')" />
    <RouterView @close="closeTab" />
    <ModelSettings v-if="modelOpen" :session-id="id" @close="modelOpen = false" />
    <ReasoningSettings v-if="reasoningOpen" :session-id="id" @close="reasoningOpen = false" />
  </div>
</template>
