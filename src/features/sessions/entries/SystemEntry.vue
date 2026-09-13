<script setup lang="ts">
import { computed, ref } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import Modal from '../../../ui/components/Modal.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';

const props = defineProps<{ item: any }>();
const open = ref(false);
const label = computed(() => i18n.t(props.item.entry.kind === 'run_interrupted'
  ? 'entry.interruption' : props.item.entry.kind === 'background_terminal'
    ? 'entry.backgroundTerminal' : 'entry.system'));
const text = computed(() => (props.item.entry.payload?.content ?? [])
  .map((block: { text?: string }) => block.text ?? '').join('\n') || props.item.entry.payload?.text || '');
</script>

<template>
  <div class="entry system">
    <div class="body">
      <span v-if="item.entry.kind === 'run_interrupted'" class="stop-marker" role="status"><Icon name="square" />{{ i18n.t('entry.stopped') }}</span>
      <button v-else class="fold-chip" @click="open = true"><Icon name="circle-dot" />{{ label }}</button>
      <Modal :open="open" :title="label" wide @close="open = false">
        <pre class="detail-pre">{{ text }}</pre>
        <CopyButton :text="text" />
      </Modal>
    </div>
  </div>
</template>

<style scoped>
.stop-marker { color: var(--err); }
.stop-marker :deep(svg) { width: 14px; height: 14px; }
</style>
