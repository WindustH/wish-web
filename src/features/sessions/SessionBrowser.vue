<script setup lang="ts">
import { onActivated, onDeactivated, ref, useTemplateRef, watch } from 'vue';
import { sessionSetTools } from '../../core/api/endpoints.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { tr } from '../../core/i18n/tr.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import PageRegion from '../../domain/media/PageRegion.vue';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import { useSessionBrowser } from './useSessionBrowser.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useSurfaceOcclusion } from '../../ui/composables/useSurfaceOcclusion.ts';
import SessionSidebarTitle from './SessionSidebarTitle.vue';

const props = defineProps<{ session: string; mobile: boolean; enabled: boolean; open: boolean }>();
const emit = defineEmits<{ close: []; navigate: [view: 'info' | 'library' | 'tasks' | 'browser'] }>();
const menuOpen = ref(false);
const pageActive = usePageActivity();
const mountedPage = ref(true);
onActivated(() => {
  mountedPage.value = true;
});
onDeactivated(() => {
  mountedPage.value = false;
});
const surface = useTemplateRef<HTMLElement>('surface');
const occluded = useSurfaceOcclusion(surface);
useBackLayer(
  () => props.open && props.mobile && pageActive.value && mountedPage.value,
  () => emit('close'),
  () => 45,
);
watch(
  () => props.open,
  () => {
    menuOpen.value = false;
  },
);
const frozen = ref(false),
  browserTools = ref<HTMLElement>();
const { snapshot, address, status, pageCreated, error, openAddress, connect } = useSessionBrowser(
  props.session,
  () => props.enabled,
  surface,
  () => props.open && pageActive.value && mountedPage.value && !menuOpen.value && !occluded.value && !frozen.value,
);
const enabling = ref(false);
async function enableBrowser() {
  const id = props.session;
  enabling.value = true;
  error.value = '';
  try {
    chat.adoptSnapshot(id, await sessionSetTools(id, { browser: true }));
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e);
  } finally {
    enabling.value = false;
  }
}
</script>
<template>
  <IslandSidebar
    :open="open"
    :retain-content="false"
    :overlay="mobile"
    :title="tr('浏览器', 'Browser')"
    :width="prefs.rightSidebarWidth.value"
    @update:width="prefs.setRightSidebarWidth"
    @back="emit('close')"
    @close="emit('close')"
  >
    <template #title
      ><SessionSidebarTitle current="browser" @open-change="menuOpen = $event" @select="emit('navigate', $event)"
    /></template>
    <section class="browser-pane">
      <div v-if="!enabled" class="browser-empty">
        <button type="button" class="btn" :disabled="enabling" @click="enableBrowser">
          {{ tr('为此会话启用浏览器', 'Enable browser for this session') }}
        </button>
      </div>
      <form v-else-if="status === 'ready' || pageCreated" class="address-bar" @submit.prevent="openAddress">
        <input
          v-model="address"
          class="input"
          :aria-label="tr('网址', 'Address')"
          placeholder="https://"
          inputmode="url"
          enterkeyhint="go"
          autocapitalize="none"
          :spellcheck="false"
          required
        />
        <span ref="browserTools"></span>
      </form>
      <div v-else class="browser-empty">
        <span v-if="status === 'connecting'" role="status">{{ tr('正在连接…', 'Connecting…') }}</span>
        <button v-else class="btn" @click="connect">{{ tr('连接本机浏览器', 'Connect device browser') }}</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <div v-if="status === 'ready' || pageCreated" ref="surface" class="surface">
        <PageRegion
          v-if="pageCreated && surface && open"
          :element="surface"
          :session="session"
          :name="tr('浏览器', 'Browser')"
          :toolbar="browserTools"
          :capture="snapshot"
          @freeze="frozen = $event"
        />
      </div>
    </section>
  </IslandSidebar>
</template>
<style scoped>
.browser-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 8px;
  gap: 8px;
}
.address-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.address-bar input {
  min-width: 0;
  flex: 1;
}
.surface {
  border-radius: var(--radius);
  overflow: hidden;
  position: relative;
  flex: 1;
  min-height: 0;
}
.browser-pane p {
  margin: 0;
  color: var(--fg-muted);
}
</style>
