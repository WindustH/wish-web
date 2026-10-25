<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import VirtualRows from '../../ui/components/VirtualRows.vue';
import CopyButton from '../../ui/components/CopyButton.vue';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ close: [] }>();
const tab = ref('messages');
const context = shallowRef<api.ContextInspection>();
const history = shallowRef<api.InspectionHistoryPage['items']>([]);
const cursor = shallowRef<unknown>(null);
const historyLoaded = ref(false), busy = ref(false), historyBusy = ref(false);
const error = ref(''), historyError = ref('');
const detail = ref<string | null>(null), detailTitle = ref(''), raw = ref(false);
const readable = computed(() => {
  try {
    const value = JSON.parse(detail.value ?? 'null');
    const message = value && !Array.isArray(value) ? value[Object.keys(value)[0]!] : null;
    return message?.content?.filter((block: any) => block.Text).map((block: any) => block.Text.text).join('\n\n') || message?.plaintext || '';
  } catch { return ''; }
});
let controller = new AbortController(), generation = 0, selection = 0;
const tabs = computed(() => [
  ['messages', tr('当前消息', 'Current messages')], ['tools', tr('工具定义', 'Tools')],
  ['settings', tr('调用设置', 'Settings')], ['history', tr('原始历史', 'Original history')],
]);
const messages = computed(() => context.value?.request.conversation ?? []);
const tools = computed(() => context.value?.request.tools ?? []);
const settings = computed(() => {
  if (!context.value) return {};
  const { conversation, tools, ...rest } = context.value.request;
  return { provider: context.value.provider, captured_at: context.value.captured_at, ...rest };
});
// Keep image bytes out of the DOM; their blob references remain inspectable.
function json(value: unknown) {
  const copy = structuredClone(value);
  const messages = Array.isArray(copy) ? copy.map(record => record?.content?.value?.message) : [copy];
  for (const message of messages) {
    for (const role of ['System', 'Developer', 'User', 'Assistant']) {
      for (const block of message?.[role]?.content ?? []) {
        if (block.Image?.data_base64) block.Image.data_base64 = '[image bytes omitted]';
      }
    }
  }
  return JSON.stringify(copy, null, 2);
}
function title(message: Record<string, any>) { return message.type ?? Object.keys(message)[0] ?? 'Message'; }
function preview(value: unknown) { return JSON.stringify(value).slice(0, 240); }
function show(name: string, value: unknown) { selection++; raw.value = false; detailTitle.value = name; detail.value = json(value); }
async function refresh() {
  controller.abort(); controller = new AbortController();
  const version = ++generation;
  selection++; detail.value = null; context.value = undefined; history.value = [];
  cursor.value = null; historyLoaded.value = false; historyBusy.value = false; historyError.value = '';
  error.value = ''; busy.value = true;
  try { const result = await api.sessionInspectContext(props.sessionId, { signal: controller.signal }); if (version === generation) context.value = result; }
  catch (e) { if (version === generation) error.value = String(e); }
  finally { if (version === generation) busy.value = false; }
  if (version === generation && tab.value === 'history') await loadHistory();
}
async function loadHistory() {
  if (historyBusy.value || (historyLoaded.value && !cursor.value)) return;
  const version = generation, previous = cursor.value;
  historyBusy.value = true; historyError.value = '';
  try {
    const result = await api.sessionInspectHistory(props.sessionId, previous, { signal: controller.signal });
    if (version !== generation) return;
    const seen = new Set(history.value.map(item => item.record.sequence));
    history.value = [...history.value, ...result.items.filter(item => !seen.has(item.record.sequence))];
    cursor.value = JSON.stringify(result.next) === JSON.stringify(previous) ? null : result.next;
    historyLoaded.value = true;
  } catch (e) { if (version === generation) historyError.value = String(e); }
  finally { if (version === generation) historyBusy.value = false; }
}
async function openRecord(sequence: number) {
  const version = generation, selected = ++selection;
  detailTitle.value = `#${sequence}`; detail.value = tr('加载中…', 'Loading…');
  try {
    const result = await api.sessionInspectRecord(props.sessionId, sequence, { signal: controller.signal });
    if (version === generation && selected === selection) detail.value = json(result);
  } catch (e) { if (version === generation && selected === selection) detail.value = String(e); }
}
watch(tab, value => { if (value === 'history' && !historyLoaded.value) void loadHistory(); });
watch(() => props.sessionId, refresh, { immediate: true });
onBeforeUnmount(() => { generation++; selection++; controller.abort(); });
</script>

<template>
  <Modal :open="true" :title="tr('模型上下文与历史', 'Model context and history')" wide body-scroll="content" content-class="context-inspector" @close="emit('close')">
    <p class="inspection-note">{{ tr('当前上下文按现有配置生成，包含完整系统指令；不是过去请求的逐字存档。排队输入、未完成的工具批次及请求内临时提示不在此预览中；图片以引用显示。原始历史保留已记录的消息和事件。', 'Current context is generated with current settings, including full system instructions; it is not an archive of past requests. Queued inputs, unfinished tool batches and temporary request-local prompts are excluded; images appear as references. Original history preserves recorded messages and events.') }}</p>
    <div class="inspection-tabs">
      <button v-for="[key, label] in tabs" :key="key" class="btn ghost sm" :aria-pressed="tab === key" @click="tab = key">{{ label }}</button>
      <button class="btn ghost sm" :disabled="busy" @click="refresh">{{ tr('刷新', 'Refresh') }}</button>
    </div>
    <template v-if="tab === 'history'">
      <p v-if="historyError" role="alert">{{ historyError }}</p>
      <VirtualRows :count="history.length" :row-size="64" class="modal-scroll-region" :label="tr('原始历史', 'Original history')" :item-key="index => history[index]!.record.sequence">
        <template #default="{ index }"><button class="inspection-row" @click="openRecord(history[index]!.record.sequence)"><strong>#{{ history[index]!.record.sequence }} · {{ history[index]!.message_type || history[index]!.event_type || 'Record' }}</strong><small>{{ history[index]!.tool_name }}</small></button></template>
      </VirtualRows>
      <button v-if="!historyLoaded || cursor" class="btn ghost" :disabled="historyBusy" @click="loadHistory">{{ historyBusy ? tr('加载中…', 'Loading…') : tr('加载更多记录', 'Load more records') }}</button>
      <small>{{ tr('已加载', 'Loaded') }} {{ history.length }}</small>
    </template>
    <template v-else>
      <p v-if="busy">{{ tr('加载中…', 'Loading…') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <VirtualRows v-if="tab === 'messages'" :count="messages.length" :row-size="84" class="modal-scroll-region" :label="tr('当前消息', 'Current messages')">
        <template #default="{ index }"><button class="inspection-row" @click="show(`#${index + 1} · ${title(messages[index]!)}`, messages[index])"><strong>#{{ index + 1 }} · {{ title(messages[index]!) }}</strong><small>{{ preview(messages[index]) }}</small></button></template>
      </VirtualRows>
      <VirtualRows v-if="tab === 'tools'" :count="tools.length" :row-size="84" class="modal-scroll-region" :label="tr('工具定义', 'Tools')">
        <template #default="{ index }"><button class="inspection-row" @click="show(tools[index]!.name, tools[index])"><strong>{{ tools[index]!.name }}</strong><small>{{ tools[index]!.description }}</small></button></template>
      </VirtualRows>
      <pre v-if="tab === 'settings'" class="inspection-json modal-scroll-region">{{ json(settings) }}</pre>
      <small v-if="context">{{ context.request.model }} · {{ messages.length }} {{ tr('条消息', 'messages') }} · {{ tools.length }} {{ tr('个工具', 'tools') }}</small>
    </template>
  </Modal>
  <Modal v-if="detail !== null" :open="true" :title="detailTitle" wide @close="selection++; detail = null">
    <template #actions><button v-if="readable" class="btn ghost sm" @click="raw = !raw">{{ raw ? tr('正文', 'Text') : 'JSON' }}</button><CopyButton :text="readable && !raw ? readable : detail ?? ''" /></template>
    <pre class="inspection-json">{{ readable && !raw ? readable : detail }}</pre>
  </Modal>
</template>

<style scoped>
.inspection-note { font-size:12px; opacity:.7; line-height:1.6; margin:0 0 8px; }
.inspection-tabs { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; }
.inspection-tabs [aria-pressed=true] { background:var(--surface-hover, #8883); }
.inspection-row { display:flex; flex-direction:column; gap:6px; width:100%; height:100%; padding:12px; border:0; border-bottom:1px solid #8883; background:transparent; color:inherit; text-align:left; cursor:pointer; }
.inspection-row:hover { background:#8881; }
.inspection-row small { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.65; }
.inspection-json { white-space:pre-wrap; overflow-wrap:anywhere; margin:0; font-size:13px; line-height:1.6; }
</style>
