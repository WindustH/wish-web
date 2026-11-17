<script setup lang="ts">
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ answer: [value: boolean | null] }>();
</script>

<template>
  <Modal
    compact
    :open="open"
    :layer="130"
    :title="tr('Shell 也使用此代理？', 'Use this proxy for Shell too?')"
    @close="emit('answer', null)"
  >
    <p>
      {{
        tr(
          '为 Shell 设置代理环境变量，并跟随今后的网络代理修改。自定义同名变量优先。',
          'Set Shell proxy environment variables and follow future network proxy changes. Custom variables with the same names take priority.',
        )
      }}
    </p>
    <template #footer>
      <button class="btn ghost" @click="emit('answer', null)">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn" @click="emit('answer', false)">{{ tr('仅网络代理', 'Network only') }}</button>
      <button class="btn primary" @click="emit('answer', true)">{{ tr('同时设置', 'Use for both') }}</button>
    </template>
  </Modal>
</template>
