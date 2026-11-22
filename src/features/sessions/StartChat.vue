<script setup lang="ts">
import { ApiError } from '../../core/api/client.ts';
import { chat } from '../../core/state/chatSlice.ts';
import {
  captureMessageDraft,
  releaseMessageDraft,
  type MessageDraft,
  type PendingMessage,
} from '../../core/state/pendingMessages.ts';
import { requestId } from '../../core/util/requestId.ts';
import PendingMessageCard from '../../domain/chat/PendingMessageCard.vue';
import { sessionNaming } from '../../core/state/sessionNaming.ts';
import { modelLabel as formatModelLabel } from '../../domain/providers/modelLabel.ts';
import { resolvedEffort, effortLabel } from './reasoningLabels.ts';
import { initialInput, initialSessionName, uploadAttachments, type AttachmentInput } from '../../core/attachments.ts';
import Hint from '../../ui/components/Hint.vue';
import { computed, nextTick, onActivated, onDeactivated, onScopeDispose, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { sessions } from '../../core/state/sessionsSlice.ts';
import * as api from '../../core/api/endpoints.ts';
import { i18n } from '../../core/i18n/index.ts';
import { errorText } from '../../core/errors.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { pageActivityKey, usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useModelCatalog } from '../../domain/providers/useModelCatalog.ts';
import { bus } from '../../core/bus.ts';
import { tr } from '../../core/i18n/tr.ts';
import type { ModelSelection } from './useSessionSelection.ts';
import SessionCommands from './SessionCommands.vue';
import RecentSessions from './RecentSessions.vue';
import Composer from '../../domain/chat/Composer.vue';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import ModelSettings from './ModelSettings.vue';
import ReasoningSettings from './ReasoningSettings.vue';
import Icon from '../../ui/components/Icon.vue';
import Wordmark from '../../ui/components/Wordmark.vue';
import AppMenu from '../shell/AppMenu.vue';

const route = useRoute(),
  router = useRouter();
const mobile = useIsMobile();
// All sessions opens as a sheet over the home page, which stays laid out beneath it.
const home = computed(() => route.name === 'sessions' || route.name === 'all-sessions');
// The folder the new session goes in, when the list asked for one (`/new?folder=`), and its name.
const folder = computed(() =>
  route.name === 'new-chat' && typeof route.query.folder === 'string' ? route.query.folder : null,
);
const folderName = computed(() => (folder.value ? sessions.folders.value.get(folder.value)?.name : undefined));
const parentActive = usePageActivity(),
  active = ref(true);
const visible = computed(() => parentActive.value && active.value);
provide(pageActivityKey, visible);
onActivated(async () => {
  active.value = true;
  void readDefaultModel();
  await nextTick();
  if (!mobile.value && route.name === 'new-chat') composer.value?.focus();
});
onDeactivated(() => {
  active.value = false;
  modelOpen.value = false;
  reasoningOpen.value = false;
});
const catalog = useModelCatalog();
const selection = ref<ModelSelection>({ provider: '', model: '' });
const page = ref<HTMLElement>();
const composer = ref<InstanceType<typeof Composer>>();
const modelOpen = ref(false),
  reasoningOpen = ref(false),
  busy = ref(false);

const defaultModel = ref<ModelSelection>();
const defaultReady = ref(false);
// Whether the defaults have been read once: until then the model and the folder say nothing,
// rather than a placeholder for a moment. Reading them again on a return keeps what is shown.
const defaultsKnown = ref(false);
const defaultError = ref<unknown>();
const manuallySelected = ref(false);
const cwd = ref('');
const defaultCwd = ref('');
const manuallySetCwd = ref(false);
let defaultGeneration = 0;
async function readDefaultModel() {
  const generation = ++defaultGeneration;
  defaultReady.value = false;
  defaultError.value = undefined;
  try {
    const config = await api.configEffective();
    if (generation !== defaultGeneration) return;
    defaultModel.value = config.defaults.model
      ? {
          provider: config.defaults.provider,
          model: config.defaults.model,
          reasoning_effort: config.defaults.reasoning?.effort,
        }
      : undefined;
    defaultCwd.value = config.defaults.cwd || '';
    if (!manuallySetCwd.value) cwd.value = defaultCwd.value;
    defaultReady.value = true;
    defaultsKnown.value = true;
  } catch (error) {
    if (generation === defaultGeneration) {
      defaultError.value = error;
      defaultsKnown.value = true;
    }
  }
}
const stopConfiguration = bus.on('configuration.changed', () => {
  void readDefaultModel();
  void catalog.reload();
});
onScopeDispose(stopConfiguration);
function selectModel(value: ModelSelection) {
  manuallySelected.value = true;
  selection.value = value;
}
// Groups too: a cached catalog is replaced quietly when the fresh one arrives.
watch(
  [defaultReady, defaultModel, catalog.pending, catalog.groups],
  () => {
    if (!defaultReady.value || manuallySelected.value) return;
    if (defaultModel.value) {
      selection.value = { ...defaultModel.value };
      return;
    }
    if (catalog.pending.value) return;
    const candidates = catalog.groups.value.flatMap((group) =>
      group.models.map((model) => ({ provider: group.provider.id, model: model.id })),
    );
    candidates.sort((a, b) =>
      a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0,
    );
    selection.value = candidates[0] ?? { provider: '', model: '' };
  },
  { deep: true },
);
watch(
  () => route.name,
  async (name) => {
    if (name === 'new-chat' && !mobile.value && visible.value) {
      await nextTick();
      composer.value?.focus();
    }
  },
);
const effectiveEffort = computed(() => {
  const group = catalog.groups.value.find((item) => item.provider.id === selection.value.provider);
  if (!group || group.loading) return selection.value.reasoning_effort;
  return resolvedEffort(
    selection.value.reasoning_effort,
    group.models.find((item) => item.id === selection.value.model),
    group.provider.reasoning_efforts,
  );
});
const modelLabel = computed(() => formatModelLabel(selection.value.model));
const preview = ref<PendingMessage>();
let creation:
  | {
      request: api.CreateSessionBody;
      text: string;
      attachments: AttachmentInput[];
      route: string;
      attempted: boolean;
      uncertain: boolean;
    }
  | undefined;
function clearPreview(edit = false) {
  const message = preview.value;
  if (!message) return;
  if (edit) composer.value?.restoreDraft(message.draft);
  releaseMessageDraft(message.draft);
  preview.value = undefined;
  creation = undefined;
}
function send(text: string, attachments: AttachmentInput[], draft: MessageDraft) {
  if (creation) return '';
  const { provider, model, reasoning_effort } = selection.value;
  const id = requestId();
  const name = initialSessionName(text, attachments);
  creation = {
    request: {
      provider,
      model,
      reasoning_effort: reasoning_effort ?? effectiveEffort.value,
      name,
      cwd: cwd.value.trim(),
      folder: folder.value,
    },
    text,
    attachments,
    route: route.fullPath,
    attempted: false,
    uncertain: false,
  };
  preview.value = { id, owner: 'new-session', queued: false, draft: captureMessageDraft(draft), state: 'waiting' };
  void createPendingSession();
  return id;
}
async function createPendingSession() {
  const owner = creation;
  const message = preview.value;
  if (!owner || !message || busy.value) return;
  busy.value = true;
  preview.value = { ...message, error: undefined, state: owner.attachments.length ? 'uploading' : 'sending' };
  try {
    if (!owner.request.first_input) {
      owner.request.first_input = await initialInput(owner.text, owner.attachments, message.id);
      try {
        await uploadAttachments(message.id, owner.attachments, { upload: api.uploadDraftBlob });
      } catch (cause) {
        owner.request.first_input = undefined;
        throw cause;
      }
    }
    preview.value = { ...message, error: undefined, state: 'sending' };
    owner.attempted = true;
    await finishSession(owner, message, await api.sessionCreate(owner.request));
  } catch (error) {
    const rejected = error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408;
    owner.uncertain ||= owner.attempted && !rejected;
    preview.value = { ...message, state: 'failed', error, uncertain: owner.uncertain };
  } finally {
    busy.value = false;
  }
}
async function finishSession(
  owner: NonNullable<typeof creation>,
  message: PendingMessage,
  session: { id: string; first_input_entry?: number },
) {
  const id = session.id;
  bus.emit('list.changed');
  if (session.first_input_entry != null) void sessionNaming.generate(id, session.first_input_entry);
  const { provider, model, reasoning_effort } = owner.request;
  const remembered = { provider, model, reasoning_effort };
  void api
    .rememberDefaultModel(remembered)
    .then(() => {
      ++defaultGeneration;
      defaultModel.value = remembered;
    })
    .catch((error) => {
      defaultError.value = error;
    });
  manuallySelected.value = false;
  manuallySetCwd.value = false;
  cwd.value = defaultCwd.value;
  if (visible.value && route.fullPath === owner.route) {
    if (session.first_input_entry != null) chat.acceptInitialMessage(id, message.draft, session.first_input_entry);
    try {
      await router.replace('/s/' + id);
    } catch (error) {
      defaultError.value = error;
    }
  }
  clearPreview();
}
async function checkPendingSession() {
  const message = preview.value,
    owner = creation;
  if (!message || !owner || busy.value || !message.uncertain) return;
  busy.value = true;
  try {
    const session = await api.sessionGet(message.id);
    if (creation === owner) await finishSession(owner, message, session);
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.status === 404)) defaultError.value = cause;
  } finally {
    busy.value = false;
  }
}
onScopeDispose(() => {
  if (preview.value) releaseMessageDraft(preview.value.draft);
});
</script>

<template>
  <div
    ref="page"
    class="start-chat"
    tabindex="-1"
    :data-workspace-region="route.name !== 'all-sessions' ? 'chat' : undefined"
    :class="{ 'mobile-home': mobile && home, forming: preview }"
  >
    <SessionCommands
      v-if="route.name !== 'all-sessions'"
      :mobile="mobile"
      @focus="composer?.focus()"
      @scroll="(direction) => page?.scrollBy({ top: direction * 96 })"
    />
    <button
      v-if="mobile && !home"
      class="btn ghost icon-only start-back"
      :aria-label="i18n.t('chatbar.back')"
      @click="router.push('/sessions')"
    >
      <Icon name="arrow-left" />
    </button>
    <div v-if="mobile && home" class="home-actions"><AppMenu placement="header" /></div>
    <section
      v-if="preview && preview.state !== 'failed'"
      class="start-preview"
      :aria-label="tr('新会话', 'New conversation')"
    >
      <header>
        <Icon name="chat" :size="17" /><strong>{{ creation?.request.name }}</strong>
      </header>
      <PendingMessageCard
        :message="preview"
        @edit="clearPreview(true)"
        @check="checkPendingSession"
        @remove="clearPreview()"
      />
    </section>
    <div v-show="!preview || preview.state === 'failed'" class="start-surface">
      <div class="start-brand" aria-hidden="true">
        <img class="start-mark" src="/app-icons/mark.svg" alt="" /><Wordmark class="start-wordmark" />
      </div>
      <PendingMessageCard
        v-if="preview?.state === 'failed'"
        :message="preview"
        compact
        @edit="clearPreview(true)"
        @check="checkPendingSession"
        @remove="clearPreview()"
      />
      <Composer
        ref="composer"
        owner="new-session"
        :mobile="mobile"
        start
        :send-message="send"
        :disabled="!selection.model || !cwd.trim() || !!preview || busy || (!manuallySelected && !defaultReady)"
      >
        <template #selection>
          <div
            class="start-model-controls model-selection"
            :class="{ unread: !manuallySelected && (!defaultsKnown || (!selection.model && catalog.pending.value)) }"
          >
            <Hint :text="i18n.t('model.title')"
              ><button class="model-chip" :aria-expanded="modelOpen" :disabled="busy" @click="modelOpen = true">
                {{ modelLabel || i18n.t('model.title') }}
              </button></Hint
            >
            <span class="selection-dot" aria-hidden="true">·</span>
            <Hint :text="i18n.t('reasoning.title')"
              ><button
                class="reasoning-chip"
                :aria-expanded="reasoningOpen"
                :disabled="!selection.model || busy"
                @click="reasoningOpen = true"
              >
                {{ effortLabel(effectiveEffort).toUpperCase() }}
              </button></Hint
            >
          </div>
        </template>
        <!-- The picker renders no element of its own to take a class; this one holds its place. -->
        <template #footer-start
          ><span class="cwd-hold" :class="{ unread: !defaultsKnown && !manuallySetCwd }"
            ><DirectoryPicker
              :model-value="cwd"
              :disabled="busy"
              @update:model-value="
                cwd = $event;
                manuallySetCwd = true;
              " /></span
        ></template>
      </Composer>
      <p v-if="folder && folderName" class="start-folder">
        <Icon name="folder" /><span>{{
          tr(`新会话会放在「${folderName}」`, `The new session goes in “${folderName}”`)
        }}</span>
        <Hint :text="tr('放在根目录', 'Put it at the top level')"
          ><button
            type="button"
            class="btn ghost icon-only"
            :aria-label="tr('放在根目录', 'Put it at the top level')"
            :disabled="busy"
            @click="router.replace('/new')"
          >
            <Icon name="x" /></button
        ></Hint>
      </p>
      <p v-if="defaultReady && !cwd.trim()" class="hint" role="status">
        {{ tr('请填写工作目录后发送。', 'Enter a working directory before sending.') }}
      </p>
      <div v-if="defaultError" class="load-error" role="alert">
        {{ errorText(defaultError) }}
        <button class="btn ghost sm" @click="readDefaultModel">{{ i18n.t('common.retry') }}</button>
      </div>
      <div v-if="catalog.error.value" class="load-error" role="alert">
        {{ errorText(catalog.error.value) }}
        <button class="btn ghost sm" @click="catalog.reload">{{ i18n.t('common.retry') }}</button>
      </div>
      <template v-if="!selection.model">
        <p v-if="catalog.pending.value" class="hint" role="status">{{ i18n.t('new.loadingModels') }}</p>
        <div v-else class="start-empty hint">
          {{ i18n.t('new.noModels') }}
          <RouterLink class="btn ghost sm" to="/settings">{{ i18n.t('nav.settings') }}</RouterLink>
        </div>
      </template>
      <RecentSessions v-if="mobile && home" />
    </div>
    <ModelSettings v-if="modelOpen" :selection="selection" @select="selectModel" @close="modelOpen = false" />
    <ReasoningSettings
      v-if="reasoningOpen"
      :selection="selection"
      @select="selectModel"
      @close="reasoningOpen = false"
    />
  </div>
</template>

<style scoped>
.start-chat.forming {
  align-items: flex-start;
}
.start-preview {
  width: min(100%, 760px);
  padding-top: 16px;
}
.start-preview > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line);
}
.start-preview > header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.start-chat {
  height: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px clamp(24px, 5vw, 80px);
  position: relative;
}
.start-surface {
  width: 100%;
  max-width: 740px;
  margin-block: auto;
  padding-block: 24px 12vh;
}
.start-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}
.start-mark {
  display: block;
  width: 64px;
  height: auto;
}
.start-wordmark {
  height: 36px;
  color: var(--fg);
}
.cwd-hold {
  display: contents;
}
.start-model-controls {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  align-items: center;
  min-width: 0;
  gap: 3px;
}
.start-model-controls button {
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.start-model-controls .model-chip {
  flex: 0 1 auto;
  max-width: min(38vw, 320px);
}
.home-actions {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
}
.home-actions .btn {
  width: 44px;
  height: 44px;
}
.start-back {
  position: absolute;
  top: 8px;
  left: 8px;
}
.start-empty {
  display: flex;
  align-items: center;
  gap: 8px;
}
.start-folder {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 0;
  padding-left: 4px;
  color: var(--fg-subtle);
  font-size: 12.5px;
}
.start-folder > .icon {
  width: 15px;
  height: 15px;
  flex: none;
}
.start-folder .btn.icon-only {
  width: 26px;
  height: 26px;
  min-height: 26px;
}
.start-folder .btn.icon-only .icon {
  width: 14px;
  height: 14px;
}
:deep(.composer-start) {
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: var(--bg-raised);
  box-shadow: 0 4px 24px #0000000a;
  padding: 10px 14px 12px;
  min-height: 188px;
}
:deep(.composer-start.desktop) {
  --composer-send-clearance: 4px;
  padding: 10px 16px;
}
:deep(.composer-start:focus-within) {
  border-color: var(--accent);
}
:deep(.composer-start .composer-editor) {
  min-height: 80px;
}
:deep(.composer-start .composer-toolbar) {
  padding: 0;
  gap: 6px;
}
:deep(.composer-start.desktop .composer-input) {
  height: auto;
  min-height: 80px;
  align-self: stretch;
}
:deep(.composer-start-selection) {
  padding: 2px 4px 8px;
}
@media (max-width: 899px) {
  .start-chat {
    padding: 48px 16px 16px;
  }
  .start-surface {
    max-width: var(--mobile-content-width);
    padding-block: 16px 8vh;
  }
  .mobile-home {
    flex-direction: column;
    justify-content: flex-start;
    padding: 52px 16px 24px;
  }
  .mobile-home .start-surface {
    flex-shrink: 0;
    margin: auto;
    padding: 0;
  }
  :deep(.composer-mobile-actions .composer-start-selection) {
    flex: 1;
    min-width: 0;
    padding: 0;
  }
  .start-brand {
    gap: 12px;
    margin-bottom: 24px;
  }
  .start-mark {
    width: 52px;
  }
  .start-wordmark {
    height: 30px;
  }
  .mobile-home .start-brand {
    margin-bottom: 16px;
  }
  .mobile-home .start-mark {
    width: 44px;
  }
  .mobile-home .start-wordmark {
    height: 26px;
  }
  /* Not docked at the screen's edge, so none of the safe-area room a docked composer keeps. */
  :deep(.composer-start.mobile) {
    min-height: 0;
    padding: 12px 12px 14px;
  }
  :deep(.composer-start .composer-mobile-actions) {
    margin-bottom: 12px;
  }
  :deep(.composer-start.mobile .composer-input) {
    font-size: 15px;
  }
  :deep(.composer-start.mobile .composer-editor),
  :deep(.composer-start.mobile .composer-input) {
    min-height: 72px;
  }
}
@media (max-height: 500px) {
  .start-surface {
    padding-block: 8px;
  }
  .start-brand {
    display: none;
  }
}
</style>
