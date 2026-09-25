<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from '../../../ui/components/Modal.vue';
import Markdown from '../../../ui/components/Markdown.vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';
import { i18n } from '../../../core/i18n/index.ts';
import { blobUrl } from '../../../core/api/endpoints.ts';
import { fmtBytes } from '../../../core/util/fmt.ts';
import { stepText,toolOutput,toolResult,fileEdits } from './processDetails.ts';
import FileDiff from './FileDiff.vue';
import ToolImage from './ToolImage.vue';
const props=defineProps<{step:any;relatedResult?:any;session?:string;diffOnly?:boolean}>();
const emit=defineEmits<{close:[]}>();
const dialog=ref<InstanceType<typeof Modal>>();
const tx=(zh:string,en:string)=>i18n.locale.value==='zh'?zh:en;
const isResult=computed(()=>props.step.kind==='entry');
const isReasoning=computed(()=>!isResult.value&&props.step.block?.type!=='tool_call');
const name=computed(()=>isResult.value?props.step.entry.payload?.tool_name:props.step.block?.name);
const output=computed(()=>toolOutput(props.step));
const result=computed(()=>toolResult(props.step));
const args=computed(()=>props.step.block?.arguments??{});
const edits=computed(()=>fileEdits(props.step));
const reasoningLabel=computed(()=>props.step.block?.display_summary?tx('思考摘要','Reasoning summary'):tx('思考过程','Reasoning'));
const title=computed(()=>props.diffOnly?tx('文件修改','File changes'):isReasoning.value?reasoningLabel.value:name.value||tx('工具','Tool'));
const text=computed(()=>stepText(props.step));
const state=computed(()=>output.value?.process?.status??result.value?.status);
const stateLabel=computed(()=>({success:tx('完成','Completed'),running:tx('运行中','Running'),exited:tx('已退出','Exited'),killed:tx('已终止','Terminated'),failed:tx('失败','Failed'),cancelled:tx('已取消','Cancelled'),unknown:tx('状态未知','Unknown')})[state.value as string]??state.value);
const imageOutput=computed(()=>isResult.value?output.value:toolOutput(props.relatedResult??{}));
const imageSrc=computed(()=>{const hash=String(imageOutput.value?.session_path??'').split(/[\\/]/).at(-1);return props.session&&hash&&/^[a-f0-9]{64}$/.test(hash)?blobUrl(`${props.session}/${hash}`):'';});
const isShellTool=computed(()=>name.value?.startsWith('shell_'));
const isHistoryTool=computed(()=>name.value?.startsWith('history_'));
const fields=computed(()=>Object.entries(args.value).filter(([key])=>!(isShellTool.value&&key==='command')));
const printable=(value:any)=>typeof value==='string'?value:JSON.stringify(value,null,2);
const fieldName=(key:string)=>({operation:tx('操作','Operation'),path:tx('文件','File'),diff:tx('编辑文件','Edited files'),check_diff:tx('向模型返回差异','Diff returned to model'),timeout:tx('等待时间（秒）','Wait (seconds)'),execution_id:tx('进程标识','Execution ID'),command:tx('命令','Command'),text:tx('检索文本','Search text'),sequence:tx('序号','Sequence'),query:tx('查询','Query'),limit:tx('数量上限','Limit'),order:tx('排序','Order'),before:tx('向前展开','Before'),after:tx('向后展开','After'),mode:tx('模式','Mode')})[key]??key;
</script>
<template>
 <Modal ref="dialog" :open="true" compact wide :content-class="`process-detail${diffOnly||name==='view_image'?' process-detail-visual':''}`" :title="title" @close="emit('close')">
  <template #compact-heading>
   <div class="process-detail-heading"><Icon :name="isReasoning?'brain':name==='view_image'?'image':isShellTool?'terminal':isHistoryTool?'search':'wrench'"/><strong class="process-detail-title">{{title}}</strong><span v-if="!isReasoning&&!diffOnly" class="detail-kind">{{isResult?tx('工具结果','Tool result'):tx('工具调用','Tool call')}}</span><span class="detail-sequence">#{{isResult?step.entry.seq:step.fromSeq}}</span><CopyButton v-if="!diffOnly" :text="text"/><button class="btn ghost icon-only" :aria-label="tx('关闭','Close')" @click="dialog?.close()"><Icon name="x"/></button></div>
  </template>
  <div v-if="diffOnly&&edits.length" class="file-diffs"><FileDiff v-for="(edit,index) in edits" :key="index" :edit="edit"/></div>
  <div v-else-if="isReasoning" class="reasoning-document"><Markdown v-if="text" :text="text"/><p v-else class="detail-muted">{{tx('此思考块没有可显示的文本。','This reasoning block has no displayable text.')}}</p></div>
  <template v-else-if="!isResult">
   <section v-if="isShellTool&&args.command" class="tool-section"><h3>{{tx('命令','Command')}}</h3><pre class="terminal-output">{{args.command}}</pre></section>
   <ToolImage v-if="name==='view_image'&&imageSrc" :src="imageSrc" :mime="imageOutput.mime_type" :path="imageOutput.path"/>
   <dl v-if="fields.length" class="tool-fields"><div v-for="[key,value] in fields" :key="key"><dt>{{fieldName(key)}}</dt><dd>{{printable(value)}}</dd></div></dl>
  </template>
  <template v-else>
   <section v-if="step.entry.payload?.command" class="tool-section"><h3>{{tx('命令','Command')}}</h3><pre class="terminal-output">{{step.entry.payload.command}}</pre></section>
   <div class="tool-status"><span v-if="stateLabel" :class="{failed:result?.status==='failed'||(output?.process?.exit_code!=null&&output.process.exit_code!==0)}">{{stateLabel}}</span><span v-if="output?.process?.exit_code!=null">{{tx('退出码','Exit code')}} {{output.process.exit_code}}</span><span v-if="output?.byte_count!=null">{{fmtBytes(output.byte_count)}}</span></div>
   <p v-if="result?.message" class="tool-error">{{result.message}}</p>
   <template v-if="isShellTool&&output?.process">
    <dl class="tool-fields"><div v-if="output.execution_id"><dt>{{tx('进程标识','Execution ID')}}</dt><dd>{{output.execution_id}}</dd></div><div v-if="output.output_path"><dt>{{tx('完整输出文件','Output file')}}</dt><dd>{{output.output_path}}</dd></div></dl>
    <section v-if="output.text" class="tool-section"><h3>{{output.encoding==='base64'?tx('输出（Base64）','Output (Base64)'):tx('输出','Output')}}</h3><pre class="terminal-output">{{output.text}}</pre><p v-if="output.output_notice" class="detail-muted">{{tx('此处显示部分输出，完整内容保存在输出文件中。','Partial output shown. Full content is available in the output file.')}}</p></section><p v-if="output.process.error" class="tool-error">{{output.process.error}}</p>
   </template>
   <template v-else-if="name==='view_image'&&result?.status==='success'">
    <ToolImage v-if="imageSrc" :src="imageSrc" :mime="output.mime_type" :path="output.path"/>
    <p v-else class="detail-muted">{{tx('此结果没有已保存的图片引用。','No saved image reference is available for this result.')}}</p>
    <p class="detail-muted">{{output.mime_type}}</p>
   </template>
   <template v-else-if="isHistoryTool&&Array.isArray(output?.items)">
    <p class="detail-muted">{{output.items.length}} {{tx('条记录','records')}}<span v-if="output.has_more"> · {{tx('还有更多结果','More results available')}}</span></p>
    <article v-for="(item,index) in output.items" :key="index" class="history-hit"><strong>#{{item.sequence??item.record?.sequence??index}}</strong><p v-if="item.snippet">{{item.snippet}}</p><pre v-else>{{printable(item)}}</pre></article>
   </template>
   <pre v-else-if="!result?.message" class="terminal-output">{{text}}</pre>
   <div v-if="edits.length" class="file-diffs"><FileDiff v-for="(edit,index) in edits" :key="index" :edit="edit"/></div>
  </template>
  <details v-if="!isReasoning&&!diffOnly" class="raw-tool"><summary>{{tx('原始数据','Raw data')}}</summary><pre>{{text}}</pre></details>
 </Modal>
</template>
<style>
.process-detail .file-diffs{display:grid;gap:10px;min-width:0}
.modal-card.process-detail:not(.modal-page){width:min(760px,calc(100vw - 40px))}.modal-card.process-detail-visual:not(.modal-page){width:min(960px,calc(100vw - 40px))}
.process-detail .modal-body{min-width:0}.modal-card.process-detail.compact .modal-body{padding:12px 16px 14px}
.process-detail-heading{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:var(--fg-subtle)}.process-detail-title{font-size:14px;color:var(--fg);line-height:1.5}.process-detail-heading>.icon{width:16px;height:16px}.detail-kind{display:flex;align-items:center;gap:6px}.detail-sequence{margin-left:auto}
.reasoning-document{max-width:70ch;margin:auto;font-size:14px;line-height:1.7}.reasoning-document .markdown{font-size:inherit}.reasoning-document .markdown>:first-child{margin-top:0}.reasoning-document .markdown>:last-child{margin-bottom:0}
.tool-section{margin:10px 0}.tool-section h3{font-size:12px;color:var(--fg-subtle);margin:0 0 5px;font-weight:500}
.terminal-output,.raw-tool pre,.history-hit pre{font:13px/1.7 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:8px 10px;background:var(--bg-inset);border:1px solid var(--line);border-radius:8px;max-height:55dvh;overflow:auto}
.tool-fields{margin:10px 0;display:grid;gap:10px}.tool-fields>div{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px}.tool-fields dt{font-size:12px;color:var(--fg-subtle)}.tool-fields dd{margin:0;font:12px/1.7 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}
.tool-status{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--fg-muted);margin-bottom:12px}.tool-status .failed,.tool-error{color:var(--err)}.tool-error{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.detail-muted{font-size:12px;color:var(--fg-subtle);line-height:1.6}
.raw-tool{margin-top:10px;color:var(--fg-subtle);font-size:12px}.raw-tool summary{cursor:pointer}.raw-tool[open] summary{margin-bottom:8px}.history-hit{border-top:1px solid var(--line);padding:12px 0;font-size:13px}.history-hit p{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:599px){.modal-card.process-detail{max-height:84dvh}.process-detail-heading{gap:6px}.process-detail-heading .detail-sequence{display:none}.process-detail-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.process-detail-heading .detail-kind{flex-shrink:0}.process-detail-heading .copy-btn{margin-left:auto}.process-detail-heading:not(:has(.copy-btn))>.btn:last-child{margin-left:auto}.process-detail-heading>.btn{flex-shrink:0}.tool-fields>div{grid-template-columns:1fr;gap:3px}.process-detail .modal-body{padding:16px}.terminal-output{font-size:12px}}
</style>
