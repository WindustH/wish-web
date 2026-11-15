<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { PeerMessageDetail } from '../activityDialogs.ts';
import { openImageLightbox } from '../../../ui/imageLightbox.ts';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';
import Markdown from '../../../domain/references/ReferenceMarkdown.vue';
import Modal from '../../../ui/components/Modal.vue';
import { useIsMobile } from '../../../ui/composables/useMedia.ts';
import { i18n } from '../../../core/i18n/index.ts';
import { fmtDateTime } from '../../../core/util/fmt.ts';
const isMobile = useIsMobile();
const props = defineProps<PeerMessageDetail>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<InstanceType<typeof Modal> | null>(null);
const title = computed(() =>
  `${props.author ? `${props.author.name} · ` : ''}${props.verb} ${props.group?.name ?? ''}`.trim(),
);
</script>
<template>
  <Modal
    ref="dialog"
    :open="true"
    :sheet="isMobile"
    :title="title"
    compact
    content-class="peer-message-window"
    @close="emit('close')"
  >
    <div class="peer-card-actions">
      <CopyButton :text="text" /><button
        type="button"
        class="btn ghost icon-only"
        :aria-label="i18n.t('common.close')"
        @click="dialog?.close()"
      >
        <Icon name="x" />
      </button>
    </div>
    <div class="peer-card-detail">
      <p class="peer-card-detail-meta">
        <RouterLink v-if="author?.to && !preview" :to="author.to">{{ author.name }}</RouterLink>
        <span v-else-if="author">{{ author.name }}</span>
        <span>{{ verb }}</span>
        <span v-if="group"><Icon name="users" />{{ group.name }}</span>
        <span v-if="at">· {{ fmtDateTime(at) }}</span>
        <span v-if="note">· {{ note }}</span>
      </p>
      <Markdown v-if="text.trim()" :text="text" />
      <img
        v-for="(src, index) in images"
        :key="index"
        class="peer-card-image zoomable"
        :src="src"
        alt=""
        loading="lazy"
        decoding="async"
        @click.stop="openImageLightbox(src)"
      />
    </div>
  </Modal>
</template>
<style scoped>
:global(.modal-card.peer-message-window:not(.modal-page)) {
  width: min(94vw, 42.5rem);
}
:global(.peer-message-window.compact .modal-body) {
  position: relative;
  padding: 14px 16px 16px;
}
:global(.peer-message-window .modal-flow-title) {
  padding-right: 76px;
  margin-bottom: 6px;
}
.peer-card-actions {
  position: absolute;
  right: 12px;
  top: 8px;
  display: flex;
  align-items: center;
  gap: 2px;
}
.peer-card-detail {
  display: grid;
  gap: 10px;
}
.peer-card-detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  color: var(--fg-subtle);
  font-size: 12.5px;
}
.peer-card-detail-meta a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--fg-muted);
  text-decoration: none;
}
.peer-card-detail-meta a .icon {
  width: 13px;
  height: 13px;
}
@media (hover: hover) {
  .peer-card-detail-meta a:hover {
    color: var(--accent);
  }
}
.peer-card-image {
  max-width: 100%;
  border-radius: 8px;
}
</style>
