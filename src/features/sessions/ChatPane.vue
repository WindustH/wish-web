<script setup lang="ts">
import { replyContextKey } from '../../domain/references/context.ts';
import { validReference, type ReplyReference, type ReplyLink } from '../../core/replyReferences.ts';
import { replyLinks, replyMessage, linkSessionFile } from '../../core/api/endpoints.ts';
import { fileMentionKey } from '../../domain/references/useFileMention.ts';
import { toast } from '../../ui/toast.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessionNaming } from '../../core/state/sessionNaming.ts';
import SessionListAction, { type ActionTarget } from './SessionListAction.vue';
import FadeText from '../../ui/components/FadeText.vue';
import { modelLabel } from '../../domain/providers/modelLabel.ts';
import { sessionParent } from '../shell/sessionNavigation.ts';
import { sessionPanelCloseKey, sessionPanelElementsKey } from '../../domain/chat/sessionPanel.ts';
import Hint from '../../ui/components/Hint.vue';
// Chat surface: top bar (desktop information/settings / mobile back+menu), log,
// composer, and a shared sidebar for session actions. Opening session
// actions never rebuilds the conversation.
import {
  computed,
  nextTick,
  onBeforeUnmount,
  provide,
  shallowRef,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { i18n } from '../../core/i18n/index.ts';
import { chat } from '../../core/state/chatSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import ChatLog from './ChatLog.vue';
import Composer from '../../domain/chat/Composer.vue';
import QueueDock from './QueueDock.vue';
import InfoPane from './InfoPane.vue';
import { useComposerHeight } from '../../domain/chat/useComposerHeight.ts';
import SessionSettingsPane from './SessionSettingsPane.vue';
import ModelSettings from './ModelSettings.vue';
import ReasoningSettings from './ReasoningSettings.vue';
import { useResolvedEffort } from './useResolvedEffort.ts';
import { effortLabel } from './reasoningLabels.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { touchButton } from '../../ui/touchButton.ts';
import { prefersReducedMotion } from '../../ui/motion/reducedMotion.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import SessionTasks from './SessionTasks.vue';
import { useBackgroundTaskCount } from './useBackgroundTaskCount.ts';
import SessionLibrary from './SessionLibrary.vue';
import type { StoredAttachmentReference } from '../../core/attachments.ts';
import type { LibraryTarget } from './libraryTarget.ts';
import type { LibraryBlob } from '../../core/api/types.ts';

const backTouch = touchButton();
const panelClose = shallowRef<(() => void) | null>(null);
provide(sessionPanelCloseKey, panelClose);
const panelButtons = new Map<string, HTMLElement>();
function rememberPanelButton(key: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) panelButtons.set(key, element);
  else panelButtons.delete(key);
}
provide(sessionPanelElementsKey, {
  anchor: () => panelButtons.get(tab.value ?? '') ?? null,
  contains: (target) => [...panelButtons.values()].some((button) => button.contains(target)),
});
const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();

const id = computed(() =>
  ['chat', 'chat-info', 'chat-search', 'chat-settings'].includes(String(route.name)) ? (route.params.id as string) : '',
);
const taskPanelOpen = ref(false);
const backgroundTaskCount = useBackgroundTaskCount(id, () => taskPanelOpen.value);
const backgroundTaskLabel = computed(
  () => tr('后台任务', 'Background tasks') + (backgroundTaskCount.value ? ` (${backgroundTaskCount.value})` : ''),
);
type SessionTab = 'info' | 'settings';
type SidebarView = SessionTab | 'library' | 'tasks';
const routeTab = computed<SessionTab | null>(() => {
  const n = route.name as string;
  return n === 'chat-info' || n === 'chat-search' ? 'info' : n === 'chat-settings' ? 'settings' : null;
});
const infoInitialSection = ref<'overview' | 'search'>('overview');
const tab = computed(() =>
  sidebarOpen.value && (sidebarKind.value === 'info' || sidebarKind.value === 'settings') ? sidebarKind.value : null,
);

let openedSession: string | undefined;
watch(
  id,
  (next) => {
    if (next) {
      openedSession = next;
      void chat.open(next);
    } else if (chat.sessionId.value === openedSession) {
      chat.close();
      openedSession = undefined;
    }
  },
  { immediate: true },
);

// A session that is gone leaves a phone on its home page, and a desktop on a new chat beside the list.
watch(chat.missingSessionId, (missingId) => {
  if (missingId && missingId === id.value) {
    void router.replace({ name: isMobile.value ? 'sessions' : 'new-chat' });
  }
});

const snapshot = computed(() => chat.snapshot.value);
const renameTarget = ref<ActionTarget | null>(null);
const titleActions = computed(() => [
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename') },
  { key: 'generate-name', icon: 'sparkles', label: tr('自动重命名', 'Auto rename') },
]);
function titleAction(key: string) {
  const session = snapshot.value;
  if (!session || session.id !== id.value) return;
  if (key === 'generate-name') void sessionNaming.generate(session.id);
  else if (key === 'rename') renameTarget.value = { id: session.id, name: session.name, kind: 'session' };
}
watch(id, () => {
  renameTarget.value = null;
});
const tabs = computed(() => [
  { key: 'info', icon: 'info', label: i18n.t('chatbar.info') },
  { key: 'settings', icon: 'tune', label: i18n.t('chatbar.settings') },
]);
const mobileActions = computed(() => [
  ...tabs.value,
  { key: 'library', icon: 'library', label: i18n.t('library.title') },
  { key: 'tasks', icon: 'terminal', label: backgroundTaskLabel.value },
]);
const modelActions = computed(() => [
  {
    key: 'model',
    icon: 'bot',
    label: modelLabel(snapshot.value?.model || '') || '—',
  },
  { key: 'reasoning', icon: 'thinking', label: effortLabel(effort.value).toUpperCase() },
]);
const chatbar = ref<HTMLElement>();
const toolbarWidth = ref(Infinity);
watch(chatbar, (element, _, onCleanup) => {
  if (!element) return;
  const observer = new ResizeObserver(([entry]) => {
    if (entry) toolbarWidth.value = entry.contentRect.width;
  });
  observer.observe(element);
  onCleanup(() => observer.disconnect());
});
const compactActions = computed(() => isMobile.value || toolbarWidth.value < 620);
const compactModel = computed(() => isMobile.value || toolbarWidth.value < 420);
const headerActions = computed(() =>
  compactModel.value
    ? [...modelActions.value, ...mobileActions.value.map((item, index) => ({ ...item, separator: index === 0 }))]
    : mobileActions.value,
);
function headerAction(key: string) {
  if (key === 'model') modelOpen.value = true;
  else if (key === 'reasoning') reasoningOpen.value = true;
  else if (['library', 'tasks', 'info', 'settings'].includes(key)) openSidebar(key as SidebarView);
}
const queued = computed(() => chat.deliveries.value);
const composerRef = ref<{
  fill: InstanceType<typeof Composer>['fill'];
  reference: (reference: ReplyReference, image?: Blob) => Promise<void>;
  mention: (reference: StoredAttachmentReference) => Promise<void>;
} | null>(null);
// The composer floats over the log's foot, so the pane tells its styles how tall that island is:
// the log keeps its last line clear of it, the fade above it and the jump button stand on its top.
const paneEl = ref<HTMLElement | null>(null);
useComposerHeight(paneEl, isMobile);
onBeforeUnmount(() => {
  if (chat.sessionId.value === openedSession) chat.close();
});
async function mentionBlob(blob: LibraryBlob, name: string) {
  const reference = { owner: id.value, id: blob.id, mime: blob.mime_type, name, size: blob.byte_count };
  if (isMobile.value) sidebarOpen.value = false;
  await nextTick();
  await composerRef.value?.mention(reference);
}

const libraryTarget = shallowRef<LibraryTarget>();
let openingFile = 0;
provide(fileMentionKey, async (file) => {
  const request = ++openingFile;
  const sourceSession = id.value;
  const blob =
    file.kind === 'local'
      ? { ...file, owner: sourceSession, id: (await linkSessionFile(sourceSession, file.path, true)).id }
      : file;
  if (request !== openingFile || sourceSession !== id.value) return;
  if (blob.owner !== id.value) await router.push({ name: 'chat', params: { id: blob.owner } });
  if (request !== openingFile || blob.owner !== id.value) return;
  sidebarState.value.view = 'library';
  sidebarOpen.value = true;
  libraryTarget.value = { request, target: blob };
});
const replyRevision = ref(0);
const focusedReference = ref<ReplyReference>();
let focusTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(focusTimer));
const replyCache = new Map<string, Promise<ReplyLink[]>>();
const previewCache = new Map<number, string>();
const replyVersions = ref(new Map<string, number>());
let replyHighWater = -1;
let observedReplyInput = false;
const pendingReplySources = new Set<string>();
watch(
  [id, () => chat.snapshot.value?.running, () => chat.entries.value.at(-1)?.seq],
  ([session, running], previous) => {
    if (session !== previous?.[0]) {
      replyHighWater = -1;
      observedReplyInput = false;
      pendingReplySources.clear();
      replyVersions.value.clear();
    }
    for (const entry of chat.entries.value) {
      if (entry.seq <= replyHighWater || entry.kind !== 'user_message') continue;
      observedReplyInput = true;
      const references = entry.payload.metadata?.custom?.reply_references;
      if (Array.isArray(references))
        for (const reference of references)
          if (validReference(reference) && reference.session === session) pendingReplySources.add(reference.source);
    }
    replyHighWater = Math.max(replyHighWater, chat.entries.value.at(-1)?.seq ?? -1);
    if (!running) {
      for (const source of pendingReplySources) {
        replyCache.delete(source);
        replyVersions.value.set(source, (replyVersions.value.get(source) ?? 0) + 1);
      }
      // A history jump can hide the new inputs. Preserve correctness when their sources
      // are unavailable; ordinary runs invalidate only the sources actually referenced.
      if (previous?.[1]) {
        if (chat.hasMoreAfter.value || !observedReplyInput) {
          replyCache.clear();
          replyRevision.value++;
        }
      }
      pendingReplySources.clear();
      observedReplyInput = false;
    }
  },
);
watch(id, () => {
  libraryTarget.value = undefined;
  focusedReference.value = undefined;
  clearTimeout(focusTimer);
  replyCache.clear();
  previewCache.clear();
});
provide(replyContextKey, {
  session: id,
  revision: replyRevision,
  version: (source) => (replyVersions.value.get(source) ?? 0) + replyRevision.value,
  focus: focusedReference,
  async add(reference, image) {
    if (reference.session !== id.value) return;
    if (isMobile.value) sidebarOpen.value = false;
    await composerRef.value?.reference(reference, image);
  },
  async locate(reference) {
    if (reference.session !== id.value) return;
    if (reference.seq !== undefined) {
      focusedReference.value = { ...reference };
      if (await chat.locate(id.value, reference.seq)) {
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => (focusedReference.value = undefined), 4000);
      } else {
        focusedReference.value = undefined;
        toast(tr('原消息已不可用', 'Message is no longer available'));
      }
      return;
    }
    if (reference.blob) {
      sidebarState.value.view = 'library';
      sidebarOpen.value = true;
      libraryTarget.value = { request: ++openingFile, target: reference };
    }
  },
  async links(source, signal) {
    const session = id.value;
    let pending = replyCache.get(source);
    if (!pending) {
      pending = (async () => {
        const result: ReplyLink[] = [];
        let cursor: unknown;
        do {
          const page = await replyLinks(session, source, cursor);
          result.push(...page.items);
          cursor = page.next;
        } while (cursor && session === id.value);
        return result;
      })();
      replyCache.set(source, pending);
      if (replyCache.size > 128) replyCache.delete(replyCache.keys().next().value!);
      pending.catch(() => {
        if (replyCache.get(source) === pending) replyCache.delete(source);
      });
    }
    const result = await pending;
    return signal.aborted || session !== id.value ? [] : result;
  },
  async preview(seq, signal) {
    if (previewCache.has(seq)) return previewCache.get(seq)!;
    const session = id.value;
    const message = await replyMessage(session, seq, { signal });
    const text = (message?.payload.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n\n');
    if (!signal.aborted && session === id.value) {
      previewCache.set(seq, text);
      if (previewCache.size > 24) previewCache.delete(previewCache.keys().next().value!);
    }
    return text;
  },
  jump(seq) {
    void chat.locate(id.value, seq).then((ok) => {
      if (!ok) toast(tr('原消息已不可用', 'Message is no longer available'));
    });
  },
});

const onQueueEdit = (text: string, attachments?: Parameters<InstanceType<typeof Composer>['fill']>[1]) =>
  composerRef.value?.fill(text, attachments);
const { effort, error: effortError } = useResolvedEffort(snapshot);
const modelOpen = ref(false);
const reasoningOpen = ref(false);
// Keep the original storage scope so existing sidebar preferences survive this expansion.
const sidebarState = useWorkspaceState('library-open', () => id.value, { open: false, view: 'library' });
const sidebarKind = computed(() =>
  ['info', 'settings', 'tasks'].includes(sidebarState.value.view) ? sidebarState.value.view : 'library',
);
const sidebarOpen = computed({
  get: () => sidebarState.value.open,
  set: (value) => {
    sidebarState.value.open = value;
  },
});
const sidebarToggle = ref<HTMLButtonElement>();
watch(
  [sidebarOpen, id],
  ([, session], [, previousSession], onCleanup) => {
    if (session !== previousSession) return;
    const button = sidebarToggle.value;
    if (!button || prefersReducedMotion()) return;
    const duration = getComputedStyle(button).getPropertyValue('--dur').trim();
    const milliseconds = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    const hold = Number.isFinite(milliseconds) ? milliseconds : 240;
    const animation = button.animate(
      [{ opacity: 0 }, { opacity: 0, offset: hold / (hold + 120), easing: 'ease-out' }, { opacity: 1 }],
      {
        duration: hold + 120,
        easing: 'ease-out',
      },
    );
    onCleanup(() => animation.cancel());
  },
  { flush: 'post' },
);
const sidebarRestoring = ref(sidebarOpen.value);
watch([id, sidebarOpen], ([session, open], [previousSession]) => {
  sidebarRestoring.value = session !== previousSession && open;
});
// Keep the current panel in place until its contents have faded out.
const sidebarDisplayedKind = ref(sidebarKind.value);
watch(
  [sidebarOpen, sidebarDisplayedKind],
  ([open, kind]) => {
    taskPanelOpen.value = open && kind === 'tasks';
  },
  { immediate: true },
);
const sidebarFading = ref(false);
const sidebarSwitching = ref(false);
const sidebarSwitched = ref(false);
watch([sidebarKind, sidebarOpen, id], ([kind, open, session], previous, onCleanup) => {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  onCleanup(() => {
    cancelled = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  });
  sidebarFading.value = false;
  sidebarSwitching.value = false;
  if (!open || !previous?.[1] || session !== previous[2]) sidebarSwitched.value = false;
  if (
    !open ||
    !previous?.[1] ||
    session !== previous[2] ||
    prefersReducedMotion() ||
    kind === sidebarDisplayedKind.value
  ) {
    sidebarDisplayedKind.value = kind;
    return;
  }
  sidebarSwitching.value = true;
  sidebarSwitched.value = true;
  sidebarFading.value = true;
  timer = setTimeout(async () => {
    sidebarDisplayedKind.value = kind;
    await nextTick();
    if (cancelled) return;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        sidebarFading.value = false;
        timer = setTimeout(() => {
          sidebarSwitching.value = false;
        }, 140);
      });
    });
  }, 100);
});
const sidebarMounted = ref(sidebarOpen.value);
const infoMounted = ref(false),
  settingsMounted = ref(false);
watch(
  [sidebarOpen, sidebarDisplayedKind, id],
  ([open, kind, session], previous) => {
    if (previous && session !== previous[2]) {
      infoMounted.value = false;
      settingsMounted.value = false;
    }
    if (open && kind === 'info') infoMounted.value = true;
    if (open && kind === 'settings') settingsMounted.value = true;
  },
  { immediate: true },
);
watch(sidebarOpen, (open) => {
  if (open) sidebarMounted.value = true;
});
const libraryRevision = ref(0);
function openSidebar(kind: SidebarView) {
  if (kind === 'info') infoInitialSection.value = 'overview';
  if (kind === 'library' && sidebarOpen.value && sidebarKind.value === kind) libraryRevision.value++;
  sidebarState.value.view = kind;
  sidebarOpen.value = true;
}
watch(id, () => {
  sidebarMounted.value = sidebarOpen.value;
  modelOpen.value = false;
  reasoningOpen.value = false;
});

// Preserve existing links, while all devices now use the same sidebar host.
watch(
  [routeTab, id, () => route.name],
  ([child, session, routeName]) => {
    if (!child || !session) return;
    infoInitialSection.value = routeName === 'chat-search' ? 'search' : 'overview';
    sidebarState.value.view = child;
    sidebarOpen.value = true;
    void router.replace({ name: 'chat', params: { id: session } });
  },
  { immediate: true },
);
</script>

<template>
  <div class="chat-workspace" :class="{ 'sidebar-open': sidebarOpen }">
    <Hint :text="i18n.t(sidebarOpen ? 'library.collapseSidebar' : 'library.expandSidebar')"
      ><button
        class="btn ghost icon-only"
        ref="sidebarToggle"
        data-sidebar-toggle
        :aria-label="i18n.t(sidebarOpen ? 'library.collapseSidebar' : 'library.expandSidebar')"
        aria-controls="session-sidebar"
        :aria-expanded="sidebarOpen"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Icon name="panel-right" /></button
    ></Hint>
    <div
      class="chat-workspace-body"
      :class="{
        'sidebar-switching': sidebarSwitching,
        'sidebar-restoring': sidebarRestoring,
        'sidebar-switched': sidebarSwitched,
        'sidebar-fading': sidebarFading,
      }"
    >
      <div class="chat-main">
        <div ref="chatbar" class="chatbar">
          <button
            v-if="isMobile"
            class="btn ghost icon-only"
            :aria-label="i18n.t('chatbar.back')"
            @click="backTouch.acceptsClick($event) && router.push(sessionParent)"
            @touchstart.passive="backTouch.start"
            @touchmove.passive="backTouch.move"
            @touchend="backTouch.end"
            @touchcancel="backTouch.cancel"
          >
            <Icon name="arrow-left" />
          </button>
          <div class="chat-title">
            <span
              v-if="!snapshot"
              class="chat-skeleton title-skeleton"
              :aria-label="i18n.t('sessions.loading')"
              role="status"
            /><Menu v-else :key="snapshot.id" context :items="titleActions" @select="titleAction">
              <FadeText
                class="name"
                :text="sessionTitle(snapshot)"
                tabindex="0"
                aria-haspopup="menu"
                :aria-label="tr('会话名称菜单', 'Session title menu')"
              />
            </Menu>
            <template v-if="!compactModel">
              <span v-if="!snapshot" class="chat-skeleton model-skeleton" aria-hidden="true" /><span
                v-else
                class="model-selection"
              >
                <Hint :text="i18n.t('model.chipTitle')"
                  ><button class="model-chip" :aria-expanded="modelOpen" @click="modelOpen = true">
                    <span>{{ modelLabel(snapshot?.model || '') || '—' }}</span>
                  </button></Hint
                >
                <span class="selection-dot" aria-hidden="true">·</span>
                <Hint :text="effortError ? describeError(effortError).message : i18n.t('reasoning.title')"
                  ><button
                    class="reasoning-chip"
                    :aria-expanded="reasoningOpen"
                    :aria-label="`${i18n.t('reasoning.title')}: ${effortLabel(effort)}`"
                    @click="reasoningOpen = true"
                  >
                    <span>{{ effortLabel(effort).toUpperCase() }}</span>
                  </button></Hint
                >
              </span>
            </template>
          </div>
          <template v-if="!compactActions">
            <Hint v-for="item in tabs" :key="item.key" :text="item.label"
              ><button
                class="btn ghost icon-only"
                :aria-label="item.label"
                :class="{ selected: tab === item.key }"
                :data-session-panel="item.key"
                :ref="(element) => rememberPanelButton(item.key, element)"
                :aria-pressed="tab === item.key"
                aria-controls="session-sidebar"
                :aria-expanded="tab === item.key"
                @click="openSidebar(item.key as SessionTab)"
              >
                <Icon :name="item.icon" /></button
            ></Hint>
          </template>
          <Menu v-else :items="headerActions" :label="i18n.t('chatbar.more')" @select="headerAction">
            <template #label="{ item }"
              ><span :class="{ 'header-model-value': item.key === 'model' || item.key === 'reasoning' }">{{
                item.label
              }}</span></template
            >
            <Icon name="ellipsis-vertical" />
          </Menu>
          <Hint v-if="!compactActions" :text="i18n.t('library.title')"
            ><button
              class="btn ghost icon-only"
              :aria-label="i18n.t('library.title')"
              aria-controls="session-sidebar"
              :aria-expanded="sidebarOpen && sidebarKind === 'library'"
              :class="{ selected: sidebarOpen && sidebarKind === 'library' }"
              @click="openSidebar('library')"
            >
              <Icon name="library" /></button
          ></Hint>
          <Hint v-if="!compactActions" :text="backgroundTaskLabel">
            <button
              class="btn ghost icon-only task-count-button"
              data-background-tasks
              :aria-label="backgroundTaskLabel"
              aria-controls="session-sidebar"
              :aria-expanded="sidebarOpen && sidebarKind === 'tasks'"
              :class="{ selected: sidebarOpen && sidebarKind === 'tasks' }"
              @click="openSidebar('tasks')"
            >
              <Icon name="terminal" />
              <span v-if="backgroundTaskCount" class="task-count-badge" aria-hidden="true">{{
                backgroundTaskCount
              }}</span>
            </button>
          </Hint>
        </div>
        <div class="chat-pane" ref="paneEl">
          <ChatLog :session-id="id" :mobile="isMobile" />
          <Composer ref="composerRef" :owner="id" :mobile="isMobile">
            <template #tools>
              <Transition name="queue-dock" appear>
                <div v-if="queued.length > 0" class="queue-dock-slot">
                  <QueueDock :items="queued" :refill="onQueueEdit" />
                </div>
              </Transition>
            </template>
          </Composer>
          <SessionListAction v-if="renameTarget" :target="renameTarget" kind="rename" @close="renameTarget = null" />
          <ModelSettings v-if="modelOpen" :session-id="id" @close="modelOpen = false" />
          <ReasoningSettings v-if="reasoningOpen" :session-id="id" @close="reasoningOpen = false" />
        </div>
      </div>
      <InfoPane
        v-if="infoMounted && id"
        :key="`info:${id}`"
        sidebar
        :open="sidebarOpen && sidebarDisplayedKind === 'info'"
        :initial-section="infoInitialSection"
        @close="sidebarOpen = false"
      />
      <SessionSettingsPane
        v-if="settingsMounted && id"
        :key="`settings:${id}`"
        sidebar
        :open="sidebarOpen && sidebarDisplayedKind === 'settings'"
        @close="sidebarOpen = false"
      />
      <SessionTasks
        @count="backgroundTaskCount = $event"
        v-if="sidebarMounted && id && sidebarDisplayedKind === 'tasks'"
        :key="id"
        :session="id"
        :open="sidebarOpen"
        :mobile="isMobile"
        @close="sidebarOpen = false"
      />
      <SessionLibrary
        v-if="sidebarMounted && id && sidebarDisplayedKind === 'library'"
        :open="sidebarOpen"
        :key="id"
        :session="id"
        :mobile="isMobile"
        :entries="chat.entries.value"
        :library-revision="libraryRevision"
        :pending-target="libraryTarget"
        @target-handled="
          (request) => {
            if (libraryTarget?.request === request) libraryTarget = undefined;
          }
        "
        @close="sidebarOpen = false"
        @mention="mentionBlob"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-workspace {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.header-model-value {
  font-size: 12px;
  font-weight: var(--weight-latin-semibold);
  text-transform: uppercase;
}
.chat-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.chat-workspace :deep([data-sidebar-toggle]) {
  position: absolute;
  top: calc((var(--h-topbar) - 36px) / 2);
  right: 12px;
  z-index: 22;
}
.chat-workspace:not(.sidebar-open) .chatbar {
  padding-right: 56px;
}
.chat-workspace :deep(.island-heading) {
  height: var(--h-topbar);
  min-height: var(--h-topbar);
  padding-right: 56px;
  box-sizing: border-box;
}
.chat-workspace-body {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .sidebar-restoring > :deep(.island-sidebar[data-state='open']),
  .sidebar-switched > :deep(.island-sidebar[data-state='open']) {
    animation: none;
  }
  .sidebar-switching > :deep(.island-sidebar) {
    animation: none;
    transition: opacity 100ms ease;
  }
  .sidebar-fading > :deep(.island-sidebar) {
    opacity: 0;
    pointer-events: none;
  }
}
/* Reserve the button's width gradually, so its arrival does not jerk the toolbar. */
.queue-dock-slot {
  display: flex;
  align-items: center;
  flex: none;
  width: 36px;
}
.queue-dock-enter-active,
.queue-dock-leave-active {
  overflow: clip;
  transition:
    width 230ms var(--ease-out),
    opacity 170ms ease,
    transform 230ms var(--ease-out);
}
.queue-dock-enter-from {
  width: 0;
  opacity: 0;
  transform: translateY(5px) scale(0.9);
}
.queue-dock-leave-to {
  width: 0;
  opacity: 0;
}
.queue-dock-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .queue-dock-enter-active,
  .queue-dock-leave-active {
    transition: none;
  }
}
.task-count-button {
  position: relative;
}
.task-count-badge {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--bg);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
}
</style>
