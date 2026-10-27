<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import SettingHint from '../../ui/domain/settings/SettingHint.vue';
import { stalls, clearStalls } from '../../ui/domain/diagnostics/scrollStalls.ts';
import { copyText } from '../../ui/clipboard.ts';
const copyStalls = () => copyText(JSON.stringify(stalls.value, null, 2));
const summary = (stall: (typeof stalls.value)[number]) =>
  [
    stall.coveredBy ? tr(`被 ${stall.coveredBy} 盖住`, `covered by ${stall.coveredBy}`) : stall.target,
    stall.moves,
    stall.click && tr(`点击：${stall.click}`, `click: ${stall.click}`),
    stall.swallowedBy,
    stall.layers.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
</script>
<template>
  <div class="scroll-stalls-panel">
    <div class="set-row stall-summary">
      <div class="set-label">
        <span>{{ tr('页面卡死时的状态', 'What the page was like when stuck') }}</span>
      </div>
      <SettingHint
        :text="
          tr(
            '一次明显的滑动或滚轮没能滚动下面的列表，或者点了按钮、链接却没有反应时，这里会记下当时的页面状态，只存在这台设备上。卡死之后来这里复制给开发者。',
            'When a clear swipe or wheel turn fails to scroll the list under it, or a tap on a button or link does nothing, the page as it was is noted here, on this device only. Copy it for the developer after the page gets stuck.',
          )
        "
      />
      <div class="stall-actions">
        <button class="btn" :disabled="!stalls.length" @click="copyStalls">
          <Icon name="copy" :size="16" />{{ tr('复制', 'Copy') }}
        </button>
        <button class="btn ghost" :disabled="!stalls.length" @click="clearStalls">{{ tr('清空', 'Clear') }}</button>
      </div>
    </div>
    <p v-if="!stalls.length" class="hint">{{ tr('还没有记录。', 'Nothing noted yet.') }}</p>
    <ol v-else class="stall-list">
      <li v-for="stall in stalls" :key="stall.at">
        <strong
          >{{ new Date(stall.at).toLocaleString() }} · {{ stall.kind }} · {{ stall.route
          }}<span v-if="stall.build"> · {{ tr('构建', 'Build') }} {{ stall.build }}</span></strong
        ><code>{{ summary(stall) }}</code>
      </li>
    </ol>
  </div>
</template>
<style scoped>
.stall-summary {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
}
.stall-summary > :deep(.cfg-hint) {
  grid-column: 1 / -1;
  grid-row: 2;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}
.stall-actions {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (max-width: 599px) {
  .stall-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stall-actions {
    margin-left: auto;
  }
}
.stall-list {
  display: grid;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.stall-list li {
  min-width: 0;
  overflow-wrap: anywhere;
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-inset);
  font-size: 12.5px;
}
.stall-list code {
  color: var(--fg-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
