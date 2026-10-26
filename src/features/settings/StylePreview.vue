<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { stylePreviewFixtures, type PreviewCategory } from './stylePreviewFixtures.ts';
import HistoryItem from '../sessions/HistoryItem.vue';
import FileChangeCards from '../sessions/entries/FileChangeCards.vue';
import ProcessGroup from '../sessions/entries/ProcessGroup.vue';
import ProcessDetailBody from '../sessions/entries/ProcessDetailBody.vue';
import GroupMessageCard from '../sessions/entries/GroupMessageCard.vue';
import ActivityDialogs from '../sessions/ActivityDialogs.vue';
import { openActivityKey, type ActivityRequest } from '../sessions/activityDialogs.ts';
const samples = stylePreviewFixtures();
const category = ref<PreviewCategory | 'all'>('all');
const narrow = ref(false);
const categories = computed(() => [
  { id: 'all', label: tr('全部', 'All') }, { id: 'files', label: tr('文件卡片', 'Files') },
  { id: 'messages', label: tr('消息与错误', 'Messages & errors') }, { id: 'tools', label: tr('工具执行', 'Tools') },
  { id: 'sessions', label: tr('Session / 群组', 'Session / groups') },
]);
const visible = computed(() => samples.filter(sample => category.value === 'all' || sample.category === category.value));
const chips = samples.filter(sample => sample.kind === 'files').map(sample => sample.item);
const request = ref<ActivityRequest | null>(null);
let requestId = 0;
provide(openActivityKey, value => { request.value = { ...value, requestId: ++requestId }; });
</script>
<template>
  <div class="style-preview">
    <p class="hint">{{ tr('使用真实组件和本地样例，不执行命令、不发送消息。卡片可点击查看详情；外观跟随当前主题。窄栏仅模拟内容宽度，手机弹窗请用真实窄窗口检查。', 'Real components with local fixtures: no commands or messages are sent. Click cards for details. Uses the current theme. Narrow mode simulates content width only; use a narrow viewport to check mobile dialogs.') }}</p>
    <div class="preview-controls">
      <label>{{ tr('分类', 'Category') }} <select v-model="category"><option v-for="option in categories" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
      <label><input v-model="narrow" type="checkbox" /> {{ tr('窄栏预览（390px）', 'Narrow column (390px)') }}</label>
    </div>
    <div class="preview-canvas" :class="{ narrow }">
      <section v-for="sample in visible" :key="sample.id" class="preview-sample" :data-preview="sample.id">
        <h3>{{ tr(sample.zh, sample.en) }}</h3>
        <FileChangeCards v-if="sample.kind === 'files'" :item="sample.item" />
        <div v-else-if="sample.kind === 'process'">
          <ProcessGroup :item="sample.item" />
          <details class="preview-tool-detail">
            <summary>{{ tr('展开调用与结果样式', 'Preview call and result details') }}</summary>
            <ProcessDetailBody :step="sample.item.steps[0]" :related-result="sample.item.steps[1]" />
          </details>
        </div>
        <GroupMessageCard v-else-if="sample.kind === 'group'" v-bind="sample.item" preview />
        <HistoryItem v-else :item="sample.item" />
      </section>
    </div>
    <ActivityDialogs :chips="chips" :request="request" session="" @dismiss="request = null" />
  </div>
</template>
<style scoped>
.style-preview { min-width: 0; }
.preview-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin: 16px 0; font-size: 13px; }
.preview-controls label { display: flex; align-items: center; gap: 8px; }
.preview-controls select { min-width: 120px; max-width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--radius); color: var(--fg); background: var(--bg-raised); font: inherit; }
.preview-canvas { width: 100%; min-width: 0; }
.preview-canvas.narrow { max-width: 390px; }
.preview-sample { min-width: 0; padding: 18px 0; border-top: 1px solid var(--line); }
.preview-tool-detail { margin-top: 10px; font-size: 13px; }
.preview-tool-detail summary { cursor: pointer; color: var(--fg-muted); }
.preview-sample > h3 { margin: 0 0 12px; color: var(--fg-subtle); font-size: 12px; font-weight: 500; }
</style>
