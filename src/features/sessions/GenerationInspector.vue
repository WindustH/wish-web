<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import CopyButton from '../../ui/components/CopyButton.vue';
import { generationText } from './generationText.ts';

const props = defineProps<{ sessionId: string }>();
defineEmits<{ close: [] }>();
const generations = shallowRef<api.StoredGeneration[]>([]), page = shallowRef<api.GenerationStructure>();
const selected = ref<number>(), kind = ref(''), origin = ref('');
const busy = ref(false), error = ref(''), starts = ref<number[]>([0]), scroll = ref<HTMLElement>();
const detail = ref<{ title: string; text: string } | null>(null);
const kinds = ['System', 'Developer', 'User', 'Assistant', 'Reasoning', 'ToolUse', 'ToolResult', 'UpstreamCompaction'];
const origins = ['Imported', 'Input', 'Model', 'Tool', 'Interrupted', 'Context', 'Summary'];
let listController = new AbortController(), pageController = new AbortController(), listVersion = 0, pageVersion = 0;
const status = (value: string) => ({ Active: tr('当前', 'Current'), Standby: tr('备用', 'Standby'), Sealed: tr('历史', 'Historical') }[value] ?? value);
const cards = computed(() => (page.value?.items ?? []).map((entry, index) => ({ entry, position: page.value!.positions[index]!, role: Object.keys(entry.message)[0] ?? '', text: generationText(entry.message) })));
const start = computed(() => starts.value.at(-1) ?? 0);
async function load() {
  pageController.abort(); pageController = new AbortController();
  const version = ++pageVersion;
  if (selected.value == null) return;
  busy.value = true; error.value = ''; page.value = undefined; detail.value = null;
  try {
    const result = await api.sessionGenerationStructure(props.sessionId, selected.value, start.value, kind.value, origin.value, { signal: pageController.signal });
    if (version !== pageVersion) return;
    page.value = result;
    generations.value = generations.value.map(generation => generation.id === result.generation.id ? result.generation : generation);
    await nextTick(); if (scroll.value) scroll.value.scrollTop = 0;
  } catch (e) { if (version === pageVersion) error.value = String(e); }
  finally { if (version === pageVersion) busy.value = false; }
}
async function refresh() {
  listController.abort(); listController = new AbortController(); pageController.abort(); pageVersion++;
  const version = ++listVersion;
  busy.value = true; error.value = ''; page.value = undefined; detail.value = null;
  try {
    const list: api.StoredGeneration[] = []; let cursor: number | null = 0;
    while (cursor !== null) {
      const result = await api.sessionGenerations(props.sessionId, cursor, { signal: listController.signal });
      if (version !== listVersion) return;
      list.push(...result.items); cursor = result.next != null && result.next > cursor ? result.next : null;
    }
    generations.value = list;
    selected.value = list.find(generation => generation.status === 'Active')?.id ?? list[0]?.id;
    starts.value = [0];
    if (selected.value != null) await load();
  } catch (e) { if (version === listVersion) error.value = String(e); }
  finally { if (version === listVersion) busy.value = false; }
}
function select() { starts.value = [0]; void load(); }
function next() { if (page.value?.next != null) { starts.value = [...starts.value, page.value.next]; void load(); } }
function previous() { starts.value = starts.value.slice(0, -1); void load(); }
watch(() => props.sessionId, () => { generations.value = []; selected.value = undefined; kind.value = ''; origin.value = ''; void refresh(); }, { immediate: true });
onBeforeUnmount(() => { listVersion++; pageVersion++; listController.abort(); pageController.abort(); });
</script>

<template>
  <Modal :open="true" wide :title="tr('上下文结构', 'Context structure')" body-scroll="content" content-class="generation-inspector" @close="$emit('close')">
    <div class="generation-filters">
      <label>Generation<select v-model="selected" :disabled="busy" @change="select"><option v-for="generation in generations" :key="generation.id" :value="generation.id">#{{ generation.id }} · {{ status(generation.status) }}</option></select></label>
      <label>{{ tr('消息类型', 'Message type') }}<select v-model="kind" :disabled="busy" @change="select"><option value="">{{ tr('全部类型', 'All types') }}</option><option v-for="value in kinds" :key="value">{{ value }}</option></select></label>
      <label>{{ tr('来源', 'Origin') }}<select v-model="origin" :disabled="busy" @change="select"><option value="">{{ tr('全部来源', 'All origins') }}</option><option v-for="value in origins" :key="value">{{ value }}</option></select></label>
      <button class="btn ghost sm" :disabled="busy" @click="refresh">{{ tr('刷新', 'Refresh') }}</button>
    </div>
    <div v-if="page" class="generation-meta">
      <span>{{ status(page.generation.status) }} · {{ page.count }} {{ tr('条目', 'entries') }}</span>
      <span>{{ tr('压缩游标', 'Compaction cursor') }}: {{ page.generation.compaction_cursor }}</span>
      <span v-if="page.generation.source">{{ tr('来源', 'Source') }}: #{{ page.generation.source[0] }} · [0, {{ page.generation.source[1] }})</span>
      <button class="btn ghost sm" @click="detail = { title: `Generation #${page.generation.id}`, text: JSON.stringify(page.generation, null, 2) }">{{ tr('结构与配置 JSON', 'Structure and settings JSON') }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }} <button class="btn ghost sm" @click="generations.length ? load() : refresh()">{{ tr('重试', 'Retry') }}</button></p>
    <p v-if="busy" role="status">{{ tr('加载中…', 'Loading…') }}</p>
    <div ref="scroll" class="generation-cards modal-scroll-region">
      <p v-if="page && !cards.length">{{ tr('没有符合条件的条目', 'No matching entries') }}</p>
      <article v-for="card in cards" :key="card.position" class="generation-entry" :data-role="card.role" :class="{ summary: card.entry.origin === 'Summary', prefix: card.position < page!.generation.compaction_cursor }">
        <header><strong>{{ card.role }}</strong><span>#{{ card.position }} · Entry {{ card.entry.id }} · {{ card.entry.origin }}</span><span v-if="card.entry.message[card.role]?.fixed === true" class="cursor-tag">{{ tr('固定指令', 'Pinned instruction') }}</span><span v-if="card.entry.message[card.role]?.metadata?.source">{{ card.entry.message[card.role].metadata.source }}</span><span v-if="card.entry.model_call_id != null">Call {{ card.entry.model_call_id }}</span><span v-if="card.position === page!.generation.compaction_cursor" class="cursor-tag">{{ tr('压缩游标', 'Compaction cursor') }}</span></header>
        <pre>{{ card.text.length > 6000 ? card.text.slice(0, 6000) + '\n…' : card.text }}</pre>
        <footer><button class="btn ghost sm" @click="detail = { title: `${card.role} · Entry ${card.entry.id}`, text: card.text }">{{ tr('查看全文', 'Full text') }}</button><button class="btn ghost sm" @click="detail = { title: `Entry ${card.entry.id} · JSON`, text: JSON.stringify(card.entry, null, 2) }">JSON</button><CopyButton :text="card.text" /></footer>
      </article>
    </div>
    <div v-if="page" class="generation-pagination"><button class="btn ghost sm" :disabled="busy || starts.length < 2" @click="previous">{{ tr('上一页', 'Previous') }}</button><span>{{ tr('第', 'Page') }} {{ starts.length }} {{ tr('页', '') }} · {{ cards.length }} {{ tr('条目', 'entries') }}</span><button class="btn ghost sm" :disabled="busy || page.next == null" @click="next">{{ tr('下一页', 'Next') }}</button></div>
  </Modal>
  <Modal v-if="detail" :open="true" wide :title="detail.title" @close="detail = null"><template #actions><CopyButton :text="detail.text" /></template><pre class="generation-full-text">{{ detail.text }}</pre></Modal>
</template>

<style scoped>
.generation-filters { display:flex; align-items:end; flex-wrap:wrap; gap:10px; padding-bottom:12px; }
.generation-filters label { display:flex; flex:1; min-width:110px; flex-direction:column; gap:5px; font-size:12px; }
.generation-filters select { width:100%; padding:8px; color:inherit; background:var(--bg-sunken); border:1px solid var(--border); border-radius:8px; }
.generation-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; font-size:12px; padding-bottom:12px; opacity:.8; }
.generation-cards { min-height:100px; overflow:auto; overscroll-behavior:contain; }
.generation-entry { --entry-accent:var(--fg-subtle); border:1px solid var(--border); border-left:3px solid var(--entry-accent); border-radius:12px; margin-bottom:12px; padding:12px 14px; background:var(--bg-sunken); }
.generation-entry[data-role=System], .generation-entry[data-role=Developer] { --entry-accent:var(--accent); }
.generation-entry[data-role=User] { --entry-accent:var(--ok); }
.generation-entry[data-role=Reasoning] { --entry-accent:var(--warn); }
.generation-entry[data-role=ToolUse], .generation-entry[data-role=ToolResult] { border-left-style:dashed; }
.generation-entry.summary { border-color:var(--warn); }
.generation-entry header { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; font-size:11px; margin-bottom:10px; }
.generation-entry header strong { font-size:13px; color:var(--entry-accent); }
.generation-entry header span { opacity:.7; }
.generation-entry header .cursor-tag { color:var(--warn); opacity:1; border:1px solid currentColor; border-radius:4px; padding:1px 4px; }
.generation-entry pre, .generation-full-text { margin:0; font-size:13px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; font-family:var(--mono); }
.generation-entry pre { max-height:220px; overflow:hidden; }
.generation-entry footer { display:flex; justify-content:flex-end; gap:4px; padding-top:8px; }
.generation-pagination { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:10px; font-size:12px; }
</style>
