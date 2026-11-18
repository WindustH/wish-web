<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import NavigationShortcutEditor from './NavigationShortcutEditor.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
const router = useRouter();
const mobile = useIsMobile();
const opened = ref(false);
function open() {
  if (mobile.value) void router.push('/settings?section=shortcuts&advanced=navigation');
  else opened.value = true;
}
</script>
<template>
  <section class="set-section navigation-settings">
    <button class="btn ghost" @click="open">
      <Icon name="settings" />{{ tr('高级设置', 'Advanced settings') }}<Icon name="chevron-right" :size="14" />
    </button>
  </section>
  <Modal
    :open="opened && !mobile"
    compact
    :title="tr('高级快捷键', 'Advanced shortcuts')"
    content-class="navigation-settings-dialog"
    @close="opened = false"
  >
    <template #compact-heading
      ><header class="navigation-heading">
        <Icon name="keyboard" :size="18" />
        <h2>{{ tr('高级快捷键', 'Advanced shortcuts') }}</h2>
        <button class="btn ghost icon-only" :aria-label="tr('关闭', 'Close')" @click="opened = false">
          <Icon name="x" :size="18" />
        </button></header
    ></template>
    <NavigationShortcutEditor />
  </Modal>
</template>
<style scoped>
:global(.modal-card.navigation-settings-dialog:not(.modal-page):not(.modal-sheet)) {
  width: min(480px, calc(100vw - 32px));
}
:global(.navigation-settings-dialog .modal-body) {
  padding: 16px 20px;
}
.navigation-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.navigation-heading h2 {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.navigation-heading .btn {
  min-height: 28px;
  width: 28px;
}
</style>
