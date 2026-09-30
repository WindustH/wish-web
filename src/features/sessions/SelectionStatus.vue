<script setup lang="ts">
// What the model and reasoning pickers say beneath their list: that a change waits for the next
// request while a run goes on, why the last one failed, and that something is loading or saving.
// A picker's own notes go in the default slot, between the failure and the progress.
import Spinner from '../../ui/components/Spinner.vue';
import { errorText } from '../../core/errors.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{ running?: boolean; error: unknown; conflict: boolean; loading: boolean; saving: boolean; busy: boolean; loadingText: string }>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <p v-if="running" class="command-status hint">{{ tr('修改从下一次模型请求开始生效，当前请求不会中断。', 'Changes apply to the next model request without interrupting the current one.') }}</p>
  <div v-if="error" class="command-status load-error" role="alert">{{ conflict ? i18n.t('model.conflict') : errorText(error) }}<button class="btn ghost sm" :disabled="loading || saving" @click="emit('retry')">{{ i18n.t('common.retry') }}</button></div>
  <slot />
  <p v-if="busy" class="command-status hint" role="status"><Spinner /> {{ saving ? i18n.t('picker.switching') : loadingText }}</p>
</template>
