<script setup lang="ts">
import { computed, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { stalls, clearStalls, type ScrollStall } from '../../domain/diagnostics/scrollStalls.ts';
import { copyText } from '../../ui/clipboard.ts';
import SettingsPage from '../../ui/components/SettingsPage.vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import DebugToolRow from './DebugToolRow.vue';

const mobile = useIsMobile();
const selected = ref<ScrollStall>();
const clearing = ref(false);
const copied = ref(false);
const kind = (stall: ScrollStall) =>
  stall.kind === 'tap'
    ? tr('点击无响应', 'Tap did not respond')
    : stall.kind === 'touch'
      ? tr('滑动未滚动', 'Swipe did not scroll')
      : tr('滚轮未滚动', 'Wheel did not scroll');
const fields = computed(() => {
  const s = selected.value;
  if (!s) return [];
  return [
    [tr('发生时间', 'Time'), new Date(s.at).toLocaleString()],
    [tr('页面', 'Route'), s.route],
    [tr('目标元素', 'Target'), s.target],
    [tr('覆盖元素', 'Covering element'), s.coveredBy],
    [tr('滚动容器', 'Scroll container'), s.scroller],
    [tr('滚动位置 / 内容高度 / 可视高度', 'Scroll offset / content height / viewport height'), s.scroll],
    [tr('点击事件', 'Click event'), s.click],
    [tr('拦截来源', 'Intercepted by'), s.swallowedBy],
    [tr('移动事件', 'Move events'), s.moves],
    [tr('界面层级', 'Layers'), s.layers?.join(', ')],
    [tr('构建版本', 'Build'), s.build],
  ].filter(([, value]) => value);
});
async function copy(records: ScrollStall | ScrollStall[]) {
  copied.value = await copyText(JSON.stringify(records, null, 2));
}
function open(record: ScrollStall) {
  copied.value = false;
  selected.value = record;
}
function close() {
  selected.value = undefined;
  copied.value = false;
}
</script>
<template>
  <section class="scroll-stalls-panel set-section">
    <div class="set-section-head stall-heading">
      <h3>
        {{ tr('最近记录', 'Recent records') }}<span v-if="stalls.length"> · {{ stalls.length }}</span>
      </h3>
      <div class="stall-actions" v-if="stalls.length">
        <button
          type="button"
          class="btn ghost icon-only"
          :title="tr('复制全部记录', 'Copy all records')"
          :aria-label="tr('复制全部记录', 'Copy all records')"
          @click="copy(stalls)"
        >
          <Icon :name="copied ? 'check' : 'copy'" :size="16" />
        </button>
        <button
          type="button"
          class="btn ghost icon-only"
          :title="tr('清空记录', 'Clear records')"
          :aria-label="tr('清空记录', 'Clear records')"
          @click="clearing = true"
        >
          <Icon name="trash-2" :size="16" />
        </button>
      </div>
    </div>
    <ol v-if="stalls.length" class="set-card stall-list">
      <li v-for="(stall, index) in stalls" :key="stall.at + index">
        <DebugToolRow
          icon="history-read"
          :title="kind(stall)"
          :description="new Date(stall.at).toLocaleString() + ' · ' + stall.route"
          @open="open(stall)"
        />
      </li>
    </ol>
    <div v-else class="set-card stall-empty">
      <Icon name="history-read" :size="22" /><span>{{ tr('暂无卡死记录', 'No stall records yet') }}</span>
    </div>
    <p class="stall-note">
      {{
        tr(
          '点击或滚动无响应时，页面状态会保存在此设备上。',
          'When a tap or scroll does not respond, the page state is saved on this device.',
        )
      }}
    </p>

    <SettingsPage
      v-if="selected"
      :open="true"
      :page="mobile"
      :layer="80"
      content-class="stall-detail"
      :title="kind(selected)"
      @close="close"
    >
      <dl class="set-card stall-fields">
        <div v-for="[label, value] in fields" :key="label" class="set-row stacked">
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
      <template #footer
        ><button class="btn" @click="copy(selected)">
          <Icon :name="copied ? 'check' : 'copy'" />{{
            copied ? tr('已复制', 'Copied') : tr('复制完整记录', 'Copy full record')
          }}
        </button></template
      >
    </SettingsPage>
    <Modal
      :open="clearing"
      compact
      :layer="80"
      :title="tr('清空卡死记录？', 'Clear stall records?')"
      @close="clearing = false"
    >
      <p>{{ tr('这会删除此设备上保存的全部卡死记录。', 'This deletes all stall records saved on this device.') }}</p>
      <template #footer
        ><button class="btn ghost" @click="clearing = false">{{ tr('取消', 'Cancel') }}</button
        ><button
          class="btn danger"
          @click="
            clearStalls();
            clearing = false;
            copied = false;
          "
        >
          {{ tr('清空', 'Clear') }}
        </button></template
      >
    </Modal>
  </section>
</template>
<style scoped>
.stall-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stall-heading h3 span,
.stall-note,
.stall-empty,
.stall-fields dt {
  color: var(--fg-subtle);
}
.stall-actions {
  display: flex;
}
.stall-list,
.stall-fields {
  margin: 0;
  padding: 0;
  list-style: none;
}
.stall-list li + li {
  border-top: 1px solid var(--line);
}
.stall-list :deep(.debug-tool-description) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.stall-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 16px;
  font-size: 14px;
}
.stall-note {
  margin: 10px 4px;
  font-size: 12px;
  line-height: 1.6;
}
.stall-fields dt {
  font-size: 12px;
}
.stall-fields dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
@media (max-width: 899px) {
  .stall-empty,
  .stall-list li {
    background: var(--bg-group);
  }
  .stall-list li + li {
    border-top: 2px solid var(--bg-sunken);
  }
}
@media (pointer: coarse) {
  .stall-actions button {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
