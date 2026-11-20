<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { sessionNotice, type SessionNotice } from '../../domain/chat/sessionNotice.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import SelectField from '../../ui/components/SelectField.vue';
import Icon from '../../ui/components/Icon.vue';
import ToastCard from '../../ui/components/ToastCard.vue';
import ToastStack from '../../ui/components/ToastStack.vue';

const props = defineProps<{ placement: 'mobile' | 'desktop' }>();
const selected = ref<SessionNotice['kind'] | 'update'>('retry');
const samples = computed(
  () =>
    ({
      retry: { kind: 'retry', operation: 'web_search', attempt: 2, max: 5, detail: 'HTTP 503' },
      failed: { kind: 'failed', detail: tr('连接超时。', 'The connection timed out.') },
      recovery: { kind: 'recovery', attempt: 1 },
      question: { kind: 'question', detail: tr('使用哪个目录？', 'Which directory should I use?') },
      idle: { kind: 'idle' },
    }) satisfies Record<SessionNotice['kind'], SessionNotice>,
);
const labels = computed(() => ({
  retry: tr('上游重试', 'Upstream retry'),
  recovery: tr('恢复生成', 'Stream recovery'),
  failed: tr('会话错误', 'Session error'),
  question: tr('等待回答', 'Waiting for an answer'),
  idle: tr('工作已完成', 'Work completed'),
  update: tr('版本更新', 'App update'),
}));
const options = computed(() => Object.entries(labels.value).map(([value, label]) => ({ value, label })));
function select(value: string) {
  if (Object.hasOwn(labels.value, value)) selected.value = value as keyof typeof labels.value;
}
const card = computed(() =>
  selected.value === 'update'
    ? { text: i18n.t('pwa.updateAvailable'), detail: i18n.t('pwa.reloadHint'), icon: 'sparkles' }
    : sessionNotice(tr('月球地图', 'Lunar maps'), samples.value[selected.value]),
);
const action = computed(() => (selected.value === 'update' ? i18n.t('pwa.reload') : tr('打开会话', 'Open session')));
const playing = ref<{ id: number; card: typeof card.value; action: string; update: boolean } | null>(null);
let sequence = 0;
function play() {
  playing.value = { id: ++sequence, card: card.value, action: action.value, update: selected.value === 'update' };
}
watch(
  () => props.placement,
  () => play(),
);
</script>
<template>
  <div class="notice-preview-controls">
    <SelectField
      :model-value="selected"
      :options="options"
      :aria-label="tr('通知类型', 'Notification type')"
      @update:model-value="select"
    />
    <button class="btn notice-play" type="button" @click="play">
      <Icon name="play" :size="15" />{{ tr('播放通知', 'Play notification') }}
    </button>
  </div>
  <ToastStack :placement="placement">
    <ToastCard
      v-if="playing"
      :key="playing.id"
      v-bind="playing.card"
      :persistent="playing.update"
      @dismiss="playing = null"
    >
      <button class="btn" :class="playing.update ? 'primary' : 'ghost'" type="button" @click="playing = null">
        {{ playing.action }}
      </button>
    </ToastCard>
  </ToastStack>
</template>
<style scoped>
.notice-preview-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.notice-preview-controls :deep(.control-select) {
  width: auto;
  flex: 1 1 auto;
}
.notice-preview-controls > :deep(button) {
  min-height: 36px;
  height: auto;
  max-width: 100%;
}
</style>
