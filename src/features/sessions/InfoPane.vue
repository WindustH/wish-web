<script setup lang="ts">
import Modal from '../../ui/components/Modal.vue';
// Session details and usage; requests belong to this mounted session.
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtDateTime, fmtTokens } from '../../core/util/fmt.ts';
import type { UsageSnapshot } from '../../core/state/statsSlice.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { useProviderTitles } from '../../ui/composables/useProviderTitles.ts';
import { modelLabel } from '../../ui/modelLabel.ts';
import { presetBrand } from '../../ui/providerPresentation.ts';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import { contextGauge } from './contextUsage.ts';
import { useModelCatalog } from './useModelCatalog.ts';

const UsageCharts = defineAsyncComponent(() => import('../usage/UsageCharts.vue'));
defineEmits<{ close: [] }>();
const isMobile = useMedia('(max-width: 899px)');

const snapshot = computed(() => chat.snapshot.value);
const buildId = __BUILD_ID__;
const usage = ref<UsageSnapshot | null>(null);
const err = ref<any>(null);
let alive = true;
let gen = 0;
const owns = (sid: string | null | undefined) => alive && !!sid && chat.sessionId.value === sid;

async function refresh() {
  const id = chat.sessionId.value;
  if (!id) return;
  const my = ++gen;
  err.value = null;
  try {
    const usagePage = await api.sessionUsage(id);
    if (my !== gen || !owns(id)) return;
    usage.value = usagePage;
  } catch (e) {
    if (my !== gen || !owns(id)) return;
    err.value = e;   // failures surface with a retry — never a fake empty list
  }
}
onMounted(refresh);
onUnmounted(() => { alive = false; gen++; });
// Component reuse across sessions: refetch and discard stale usage.
watch(() => chat.sessionId.value, () => { usage.value = null; refresh(); });

const tokens = computed(() => usage.value?.statistics.totals.tokens ?? null);
// The model window comes from its configuration or, failing that, the upstream catalog.
const catalog = useModelCatalog();
const providerTitle = useProviderTitles();
const group = computed(() => catalog.groups.value.find(item => item.provider.id === snapshot.value?.provider));
const model = computed(() => group.value?.models.find(item => item.id === snapshot.value?.model));
const brand = computed(() => group.value && presetBrand(group.value.provider.preset));
const gauge = computed(() => contextGauge(snapshot.value?.context_tokens, snapshot.value?.config?.compaction?.trigger_tokens, model.value?.context_window_tokens ?? model.value?.context_window));
const at = (value: number | null) => value == null ? '0%' : `${Math.min(100, value / gauge.value.scale * 100)}%`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const levelLabel = computed(() => ({
  low: tr('空间充足', 'Plenty of room'),
  mid: tr('接近压缩', 'Nearing compaction'),
  high: tr('即将压缩', 'Compaction soon'),
  unknown: tr('等待下一次调用', 'After the next call'),
})[gauge.value.level]);
const remaining = computed(() => gauge.value.tokens != null && gauge.value.trigger ? Math.max(0, gauge.value.trigger - gauge.value.tokens) : null);
const phase = computed(() => snapshot.value?.phase || 'idle');
</script>

<template>
  <Modal :open="true" content-class="session-window usage-info-window" :title="i18n.t('info.title')" :page="isMobile" @close="$emit('close')">
    <div v-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
      <button class="btn ghost sm" @click="refresh">{{ i18n.t('common.retry') }}</button>
    </div>
    <template v-if="snapshot">
      <header class="info-hero">
        <span class="info-mark"><ProviderIcon :brand="brand" /></span>
        <div class="info-hero-text">
          <strong>{{ snapshot.name || tr('未命名会话', 'Untitled session') }}</strong>
          <small>{{ modelLabel(snapshot.model || '') || '—' }} · {{ snapshot.provider ? providerTitle(snapshot.provider) : '—' }}</small>
        </div>
        <span class="info-phase" :class="phase"><i aria-hidden="true" />{{ i18n.t(`phase.${phase}`) }}</span>
      </header>

      <section class="info-card context-card" :class="gauge.level" :aria-label="i18n.t('info.contextUsage')">
        <header class="info-card-head">
          <h4>{{ tr('上下文', 'Context') }}</h4>
          <span class="context-state"><i aria-hidden="true" />{{ levelLabel }}</span>
        </header>
        <div class="context-bar" role="meter" :aria-valuenow="gauge.tokens ?? 0" aria-valuemin="0" :aria-valuemax="gauge.trigger ?? gauge.window ?? 0" :aria-valuetext="gauge.ratio == null ? levelLabel : percent(gauge.ratio)">
          <span class="context-fill" :style="{ width: at(gauge.tokens) }" />
          <span v-if="gauge.trigger" class="context-trigger" :style="{ left: at(gauge.trigger) }" />
        </div>
        <dl class="context-figures">
          <div class="current"><dt>{{ tr('当前占用', 'In use') }}</dt><dd>{{ gauge.tokens == null ? '—' : fmtTokens(gauge.tokens) }}</dd><small>{{ gauge.ratio == null ? tr('下一次模型调用后更新', 'Updates after the next call') : tr('触发阈值的 ', '') + percent(gauge.ratio) + tr('', ' of the trigger') }}</small></div>
          <div class="trigger"><dt><i aria-hidden="true" />{{ tr('触发压缩', 'Compaction at') }}</dt><dd>{{ gauge.trigger ? fmtTokens(gauge.trigger) : tr('未启用', 'Off') }}</dd><small>{{ remaining != null ? tr('还剩 ', '') + fmtTokens(remaining) + tr('', ' left') : '' }}</small></div>
          <div class="window"><dt>{{ tr('模型上限', 'Model window') }}</dt><dd>{{ gauge.window ? fmtTokens(gauge.window) : tr('未知', 'Unknown') }}</dd><small>{{ gauge.window ? '' : tr('可在模型设置中填写', 'Set it in model settings') }}</small></div>
        </dl>
      </section>

      <section class="info-card">
        <dl class="info-facts">
          <div><dt>{{ i18n.t('info.compactionCount') }}</dt><dd>{{ snapshot.compaction_count }}</dd></div>
          <div><dt>{{ i18n.t('info.queue') }}</dt><dd>{{ snapshot.queue ?? 0 }}</dd></div>
          <div v-if="snapshot.standby_preparing"><dt>{{ i18n.t('info.standby') }}</dt><dd>{{ i18n.t('chat.standbyPreparing') }}</dd></div>
          <div><dt>{{ i18n.t('info.build') }}</dt><dd class="info-build">{{ buildId }}</dd></div>
          <div class="wide"><dt>{{ i18n.t('info.createdAt') }}</dt><dd>{{ fmtDateTime(snapshot.created_at) }}</dd></div>
          <div class="wide"><dt>{{ i18n.t('info.updatedAt') }}</dt><dd>{{ fmtDateTime(snapshot.updated_at) }}</dd></div>
        </dl>
      </section>

      <section v-if="snapshot.agent_custom?.trim()" class="info-card info-instructions">
        <h4>{{ i18n.t('info.agentCustom') }}</h4>
        <p>{{ snapshot.agent_custom }}</p>
      </section>
    </template>

    <section class="info-card">
      <header class="info-card-head"><h4>{{ i18n.t('info.usage') }}</h4></header>
      <dl v-if="usage" class="info-usage">
        <div><dt>{{ i18n.t('stats.attempts') }}</dt><dd>{{ usage.statistics.model_attempts }}</dd></div>
        <div><dt>{{ i18n.t('stats.tokensIn') }}</dt><dd>{{ fmtTokens(tokens?.input_tokens) }}</dd></div>
        <div><dt>{{ i18n.t('stats.tokensOut') }}</dt><dd>{{ fmtTokens(tokens?.output_tokens) }}</dd></div>
        <div><dt>{{ i18n.t('stats.tokensTotal') }}</dt><dd>{{ fmtTokens(tokens?.total_tokens) }}</dd></div>
      </dl>
      <p v-else-if="!err" class="hint">{{ i18n.t('sessions.loading') }}</p>
    </section>
    <UsageCharts v-if="chat.sessionId.value" :session-id="chat.sessionId.value" />
  </Modal>
</template>

<style scoped>
.info-hero { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.info-mark { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border: 1px solid var(--line); border-radius: 11px; background: var(--bg-raised); }
.info-hero-text { flex: 1; min-width: 0; }
.info-hero-text strong { display: block; font-size: 16px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.info-hero-text small { display: block; margin-top: 1px; font-size: 12px; color: var(--fg-subtle); }
.info-phase { display: inline-flex; flex: none; align-items: center; gap: 6px; padding: 3px 10px 3px 8px; border-radius: 99px; background: var(--bg-sunken); color: var(--fg-muted); font-size: 12px; font-weight: 500; }
.info-phase i { width: 7px; height: 7px; border-radius: 50%; background: var(--fg-faint); }
.info-phase.running i { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); animation: info-pulse 1.6s ease-in-out infinite; }
.info-phase.compacting i { background: var(--warn); }
.info-phase.queued i { background: var(--fg-subtle); }
@keyframes info-pulse { 50% { box-shadow: 0 0 0 5px transparent; } }

.info-card { margin-bottom: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
.info-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
h4 { margin: 0; font: 600 14px/1.4 var(--font); }
dl { margin: 0; }
dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }

/* The gauge: the bar spans the model window, the tick marks the compaction trigger. */
.context-card { --level: var(--fg-subtle); --level-soft: var(--bg-sunken); }
.context-card.low { --level: var(--ok); --level-soft: color-mix(in srgb, var(--ok) 14%, transparent); }
.context-card.mid { --level: var(--warn); --level-soft: color-mix(in srgb, var(--warn) 16%, transparent); }
.context-card.high { --level: var(--err); --level-soft: color-mix(in srgb, var(--err) 16%, transparent); }
.context-state { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 7px; border-radius: 99px; background: var(--level-soft); color: var(--level); font-size: 12px; font-weight: 500; }
.context-state i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.context-bar { position: relative; height: 10px; margin: 20px 0 16px; border-radius: 99px; background: var(--bg-sunken); }
.context-fill { position: absolute; inset: 0 auto 0 0; min-width: 0; border-radius: 99px; background: var(--level); transition: width var(--dur) var(--ease-out); }
.context-trigger { position: absolute; top: -5px; bottom: -5px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--fg-muted); }
.context-trigger::after { content: ''; position: absolute; top: -4px; left: 50%; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--fg-muted); }
.context-figures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.context-figures > div + div { padding-left: 12px; border-left: 1px solid var(--line); }
.context-figures dt { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg-subtle); }
.context-figures dt i { width: 2px; height: 11px; border-radius: 1px; background: var(--fg-muted); }
.context-figures dd { margin-top: 4px; font-size: 20px; font-weight: 600; line-height: 1.3; }
.context-figures .current dd { color: var(--level); }
.context-figures small { display: block; margin-top: 2px; font-size: 11px; line-height: 1.5; color: var(--fg-subtle); }

.info-facts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px 16px; font-size: 13px; }
.info-facts > div { grid-column: span 2; }
.info-facts > .wide { grid-column: span 3; }
.info-facts dt { margin-bottom: 3px; font-size: 12px; color: var(--fg-subtle); }
.info-facts dd { color: var(--fg); }
.info-build { font-family: var(--mono); font-size: calc(12px * var(--mono-scale)); color: var(--fg-muted) !important; }
.info-instructions h4 { margin-bottom: 8px; }
.info-instructions p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--fg-muted); white-space: pre-wrap; }
.info-usage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
.info-usage dt { font-size: 12px; color: var(--fg-subtle); }
.info-usage dd { margin-top: 4px; font-size: 20px; font-weight: 600; line-height: 1.3; }
.info-usage div:nth-child(even) { padding-left: 12px; border-left: 1px solid var(--line); }
@media (max-width: 599px) {
  .info-card { padding: 14px; }
  .context-figures dd, .info-usage dd { font-size: 17px; }
  .context-figures { gap: 8px; }
  .context-figures > div + div { padding-left: 8px; }
  .info-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .info-facts > div, .info-facts > .wide { grid-column: auto; }
}
</style>
