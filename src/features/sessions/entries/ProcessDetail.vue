<script setup lang="ts">
// A step's detail, in either of its homes: a window of its own (a notice's background terminal),
// or - `inline` - a panel inside the run's window, under its timeline, never a second dialog
// layered over the first. The heading and the body are the same in both; only the frame differs.
import { computed, ref } from 'vue';
import Modal from '../../../ui/components/Modal.vue';
import { stepText, toolTitle, stepToolName } from './processDetails.ts';
import { tr } from '../../../core/i18n/tr.ts';
import ProcessDetailHeading from './ProcessDetailHeading.vue';
import ProcessDetailBody from './ProcessDetailBody.vue';
const props=defineProps<{step:any;relatedResult?:any;session?:string;diffOnly?:boolean;inline?:boolean}>();
const emit=defineEmits<{close:[]}>();
const dialog=ref<InstanceType<typeof Modal>>();
const isResult=computed(()=>props.step.kind==='entry');
const isReasoning=computed(()=>!isResult.value&&props.step.block?.type!=='tool_call');
const name=computed(()=>stepToolName(props.step));
const reasoningLabel=computed(()=>props.step.block?.display_summary?tr('思考摘要','Reasoning summary'):tr('思考过程','Reasoning'));
const title=computed(()=>props.diffOnly?tr('文件修改','File changes'):isReasoning.value?reasoningLabel.value:toolTitle(name.value)||'Tool');
// What the heading's copy takes: the step, and with a call what came back from it.
const fullText=computed(()=>{
  const own=stepText(props.step);
  return isResult.value||!props.relatedResult?own:`${own}\n\n${stepText(props.relatedResult)}`;
});
</script>
<template>
 <Modal v-if="!inline" ref="dialog" :open="true" compact wide :content-class="`process-detail${diffOnly||name==='view_image'?' process-detail-visual':''}`" :title="title" @close="emit('close')">
  <template #compact-heading>
   <ProcessDetailHeading :step="step" :name="name" :title="title" :full-text="fullText" :is-result="isResult" :is-reasoning="isReasoning" :diff-only="diffOnly" @close="dialog?.close()"/>
  </template>
  <ProcessDetailBody :step="step" :related-result="relatedResult" :session="session" :diff-only="diffOnly"/>
 </Modal>
 <section v-else class="process-detail process-detail-inline" :class="{ 'process-detail-visual': diffOnly||name==='view_image' }" :aria-label="title">
  <ProcessDetailHeading :step="step" :name="name" :title="title" :full-text="fullText" :is-result="isResult" :is-reasoning="isReasoning" :diff-only="diffOnly" @close="emit('close')"/>
  <ProcessDetailBody :step="step" :related-result="relatedResult" :session="session" :diff-only="diffOnly"/>
 </section>
</template>
<style>
.process-detail .file-diffs{display:grid;gap:10px;min-width:0}
.modal-card.process-detail:not(.modal-page){width:min(760px,calc(100vw - 40px))}.modal-card.process-detail-visual:not(.modal-page){width:min(960px,calc(100vw - 40px))}
.process-detail .modal-body{min-width:0}.modal-card.process-detail.compact .modal-body{padding:12px 16px 14px}
/* The inline panel: a room of the run's window, not a card of its own - the window's full
   content width, its flow, and on a phone its sheet's scroll. */
.process-detail-inline{display:block;width:100%;min-width:0;margin-top:12px;padding:12px 0 0;border-top:1px solid var(--line)}
.process-detail-inline .process-detail-heading{margin-bottom:8px}
.process-detail-heading{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:var(--fg-subtle)}.process-detail-title{font-size:14px;color:var(--fg);line-height:1.5}.process-detail-heading>.icon{width:16px;height:16px}.detail-kind{display:flex;align-items:center;gap:6px}.detail-sequence{margin-left:auto}
.reasoning-document{max-width:70ch;margin:auto;font-size:14px;line-height:1.7}.reasoning-document .markdown{font-size:inherit}.reasoning-document .markdown>:first-child{margin-top:0}.reasoning-document .markdown>:last-child{margin-bottom:0}
.tool-section{margin:10px 0}.tool-result-title{margin:14px 0 8px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;font-weight:500;color:var(--fg-subtle)}.tool-section h3{font-size:12px;color:var(--fg-subtle);margin:0 0 5px;font-weight:500}
.terminal-output,.raw-tool pre,.history-hit pre{font:13px/1.7 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:8px 10px;background:var(--bg-inset);border:1px solid var(--line);border-radius:8px}
.tool-fields{margin:10px 0;display:grid;gap:10px}.tool-fields>div{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px}.tool-fields dt{font-size:12px;color:var(--fg-subtle)}.tool-fields dd{margin:0;font:12px/1.7 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}
.tool-status{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--fg-muted);margin-bottom:12px}.tool-status .failed,.tool-error{color:var(--err)}.tool-error{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.detail-muted{font-size:12px;color:var(--fg-subtle);line-height:1.6}
.search-hits{display:grid;gap:2px;margin:6px 0 0;padding:0;list-style:none}.search-hits li{padding:10px 0;border-top:1px solid var(--line);min-width:0}.search-hits a{font-size:14px;font-weight:500;overflow-wrap:anywhere}.search-hits small{display:block;margin-top:2px;font-size:12px;color:var(--fg-subtle);overflow-wrap:anywhere}.search-hits p{margin:4px 0 0;font-size:13px;line-height:1.6;color:var(--fg-muted);overflow-wrap:anywhere}
.raw-tool{margin-top:10px;color:var(--fg-subtle);font-size:12px}.raw-tool summary{cursor:pointer}.raw-tool[open] summary{margin-bottom:8px}.history-hit{border-top:1px solid var(--line);padding:12px 0;font-size:13px}.history-hit p{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:599px){.modal-card.process-detail{max-height:84dvh}.process-detail-heading{gap:6px}.process-detail-heading .detail-sequence{display:none}.process-detail-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.process-detail-heading .detail-kind{flex-shrink:0}.process-detail-heading .copy-btn{margin-left:auto}.process-detail-heading:not(:has(.copy-btn))>.btn:last-child{margin-left:auto}.process-detail-heading>.btn{flex-shrink:0}.tool-fields>div{grid-template-columns:1fr;gap:3px}.process-detail .modal-body{padding:16px}.terminal-output{font-size:12px}}
</style>
