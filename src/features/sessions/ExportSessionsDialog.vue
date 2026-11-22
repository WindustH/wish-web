<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { downloadExport, type ExportRequest } from './sessionPackages.ts';

const props = defineProps<{ request: ExportRequest }>();
const emit = defineEmits<{ close: [] }>();
const pending = ref<string>();
const complete = ref(new Map<string, 'saved' | 'started'>());
const errors = ref(new Map<string, string>());
const controller = new AbortController();
onBeforeUnmount(() => controller.abort());

async function download(target: ExportRequest['targets'][number]) {
  if (pending.value) return;
  errors.value.delete(target.id);
  pending.value = target.id;
  try {
    const result = await downloadExport(target, props.request.scope, controller.signal);
    if (result) complete.value.set(target.id, result);
  } catch (error) {
    if (!controller.signal.aborted) errors.value.set(target.id, describeError(error).message);
  } finally {
    pending.value = undefined;
  }
}
</script>

<template>
  <Modal :open="true" compact :title="tr('导出会话', 'Export sessions')" @close="emit('close')">
    <ul class="export-sessions">
      <li v-for="target in request.targets" :key="target.id">
        <span
          >{{ target.name
          }}<small v-if="errors.has(target.id)" class="load-error" role="alert">{{
            errors.get(target.id)
          }}</small></span
        >
        <button type="button" class="btn sm" :disabled="!!pending || complete.has(target.id)" @click="download(target)">
          <template v-if="pending === target.id">
            <Icon name="loader-circle" class="spin" />{{ tr('正在导出…', 'Exporting…') }}
          </template>
          <template v-else-if="complete.has(target.id)">
            <Icon name="check" />
            {{ complete.get(target.id) === 'saved' ? tr('已保存', 'Saved') : tr('已开始下载', 'Download started') }}
          </template>
          <template v-else>
            <Icon name="download" />{{ errors.has(target.id) ? tr('重试', 'Retry') : tr('下载 ZIP', 'Download ZIP') }}
          </template>
        </button>
      </li>
    </ul>
    <template #footer>
      <button class="btn ghost" @click="emit('close')">{{ tr('关闭', 'Close') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.export-sessions {
  margin: 0;
  padding: 0;
  list-style: none;
}
.export-sessions li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}
.export-sessions li + li {
  border-top: 1px solid var(--line);
}
.export-sessions li span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.export-sessions small {
  display: block;
}
.export-sessions button {
  flex: none;
}
</style>
