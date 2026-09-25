<script setup lang="ts">
import { unfold, fold, cancelFold } from '../../../ui/motion/fold';
import { expandedBefore, setExpanded } from '../expandState';

import ProcessDetail from './ProcessDetail.vue';
import { fileEdits, parseDiff, toolOutput } from './processDetails';
// One thumbnail covering a consecutive run of reasoning / tool calls /
// tool results (mixed-entry tool calls fold in here too). Collapsed by
// default; expanded shows the true ordered sequence.
import { computed, ref, watch } from 'vue';
import { i18n } from '../../../core/i18n/index.js';
import { firstLine } from '../../../core/util/fmt.js';
import Icon from '../../../ui/components/Icon.vue';

const props = defineProps<{ item: any; forced?: boolean; session?: string }>();
// Expansion survives virtualizer recycling: pruned rows destroy their
// component, and an open group must not fold itself shut on scroll.
// Expansion must survive regrouping while the run streams: the group key
// (first step's entry id) shifts when an earlier-seq step joins the head.
// The state is therefore written under BOTH identities — the shifting key
// and the run id (stable for the group's whole life) — and a mount restores
// from whichever it finds. This also covers the early window where the
// entry does not carry its run id yet.
const scopeKey = props.item.key;
const scopeRun = props.item.runId != null ? `r${props.item.runId}` : null;
const open = ref(
  !!props.session &&
    (expandedBefore(props.session, scopeKey) || (scopeRun != null && expandedBefore(props.session, scopeRun))),
);
const detail = ref<any>(null);
const diffOnly=ref(false);
watch(() => props.forced, (forced) => { if (forced) open.value = true; }, { immediate: true });
watch(open, (value) => {
  if (!props.session) return;
  setExpanded(props.session, scopeKey, value);
  if (scopeRun != null) setExpanded(props.session, scopeRun, value);
});

const steps = computed(() => props.item.steps ?? []);

// Type labels restored (root review): every step states what it IS —
// thinking / tool call / tool result — not just a bare name.
const typeLabel = (s: any): string =>
  s.kind === 'entry' ? (s.entry.payload?.background ? (i18n.locale.value==='zh'?'后台工具完成':'Background completion') : i18n.t('entry.toolResult'))
  : s.block?.type === 'tool_call' ? i18n.t('entry.toolCall')
  : i18n.t('entry.thinking');
const label = (s: any): string => {
  if (s.kind === 'entry') return s.entry.payload?.tool_name || 'tool';
  if (s.block?.type === 'tool_call') return s.block.name || s.block.tool_name || '—';
  return '';
};
const diffs=computed(()=>steps.value.flatMap((step:any)=>fileEdits(step).map((edit:any,index:number)=>({step,edit,key:`${step.key}:${index}`}))).map((item:any)=>{const lines=parseDiff(item.edit.diff??'');return {...item,added:lines.filter(line=>line.kind==='add').length,removed:lines.filter(line=>line.kind==='remove').length};}));
const relatedResult=computed(()=>detail.value?.block?.type==='tool_call'?steps.value.find((step:any)=>step.kind==='entry'&&step.entry.payload?.tool_call_id===detail.value.block.id):null);
const preview = (s: any): string => {
  if (s.kind === 'entry') {const value=toolOutput(s);return firstLine(value?.path||value?.text||value?.message||(s.entry.payload?.content || []).map((b:any)=>b.text||'').join('\n'),60);}
  if(s.block?.type==='tool_call')return firstLine(s.block.arguments?.command||s.block.arguments?.text||s.block.arguments?.execution_id||s.block.arguments?.path||s.block.arguments?.operation||'',60);
  return firstLine(s.block?.text || '', 60);
};
const stepIcon = (s: any) => {
  if (s.kind === 'entry') {
    const name = s.entry.payload?.tool_name;
    if (name?.startsWith('shell_')) return 'terminal';
    if (name === 'view_image') return 'image';
    if (name?.startsWith('history_')) return 'search';
    return 'wrench';
  }
  if (s.block?.type === 'tool_call') {
    const name = s.block.name || s.block.tool_name;
    if (name?.startsWith('shell_')) return 'terminal';
    if (name === 'view_image') return 'image';
    if (name?.startsWith('history_')) return 'search';
    return 'wrench';
  }
  return 'brain';
};
</script>

<template>
  <div class="proc-group" :data-seqs="steps.map((s: any) => s.kind === 'entry' ? s.entry.seq : s.fromSeq).filter((n: any) => n != null).join(' ')">
    <button class="proc-head" :aria-expanded="open" @click="open = !open">
      <Icon :name="open ? 'chevron-down' : 'layers'" />
      <span>{{ i18n.t('proc.title') }}</span><span class="proc-count">{{ steps.length }} {{ i18n.t('proc.stepsUnit') }}</span>
      <Icon class="proc-chevron" :class="{ expanded: open }" name="chevron-down" />
    </button>
    <Transition :css="false" @enter="unfold" @leave="fold" @enter-cancelled="cancelFold" @leave-cancelled="cancelFold">
    <div v-if="open" class="proc-steps">
      <button v-for="(s, i) in steps" :key="i" class="proc-step"
        :data-seq="s.kind === 'entry' ? s.entry.seq : s.fromSeq" @click="diffOnly=false;detail = s">
        <Icon :name="stepIcon(s)" />
        <span class="seq">#{{ s.kind === 'entry' ? s.entry.seq : s.fromSeq }}</span>
        <span class="type">{{ typeLabel(s) }}</span>
        <span class="name">{{ label(s) }}</span>
        <span class="pv">{{ preview(s) }}</span>
      </button>
    </div>
    </Transition>
    <button v-for="item in diffs" :key="item.key" class="process-diff-card" @click="diffOnly=true;detail=item.step">
      <Icon name="file-diff"/><span>{{item.edit.path}}<small>{{i18n.locale.value==='zh'?'文件修改':'File changes'}}</small></span><span v-if="item.edit.diff" class="process-diff-count"><b>+{{item.added}}</b><b>−{{item.removed}}</b></span><Icon name="chevron-right"/>
    </button>
    <ProcessDetail v-if="detail" :step="detail" :related-result="relatedResult" :session="session" :diff-only="diffOnly" @close="detail=null"/>
  </div>
</template>

<style scoped>
.process-diff-card{display:flex;align-items:center;gap:10px;width:100%;min-width:0;text-align:left;border:1px solid var(--line);border-radius:8px;background:var(--bg-raised);color:var(--fg);padding:12px;margin:8px 0;cursor:pointer;font:inherit;font-size:13px}
@media (hover: hover) { .process-diff-card:hover{background:var(--bg-hover)} }
.process-diff-card>span:first-of-type{flex:1;min-width:0;overflow-wrap:anywhere}.process-diff-card small{display:block;color:var(--fg-subtle);font-size:11px;margin-top:3px}.process-diff-card>.icon{flex:none;width:16px}.process-diff-count{display:flex;gap:8px;white-space:nowrap;font-size:12px}.process-diff-count b:first-child{color:var(--ok)}.process-diff-count b:last-child{color:var(--err)}
</style>
