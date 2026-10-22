<script setup lang="ts">
// Everything a step's detail says of itself, under its heading: the command, the fields, what
// came back - output, images, search hits, history records - the edits it made, and its raw
// text. Shared by the detail's two homes: a window of its own, or a panel inside a run's window.
import { computed } from 'vue';
import Markdown from '../../../ui/components/Markdown.vue';
import { blobUrl } from '../../../core/api/endpoints.ts';
import { fmtBytes } from '../../../core/util/fmt.ts';
import { stepText, stepToolName, toolOutput, toolResult, fileEdits, searchResults } from './processDetails.ts';
import FileDiff from './FileDiff.vue';
import ToolImage from './ToolImage.vue';
import { tr } from '../../../core/i18n/tr.ts';
const props=defineProps<{step:any;relatedResult?:any;session?:string;diffOnly?:boolean}>();
const isResult=computed(()=>props.step.kind==='entry');
const isReasoning=computed(()=>!isResult.value&&props.step.block?.type!=='tool_call');
const name=computed(()=>stepToolName(props.step));
// What came back: the step itself when it is a result, or the result of the call it shows.
const res=computed(()=>isResult.value?props.step:props.relatedResult??null);
const output=computed(()=>res.value?toolOutput(res.value):null);
const result=computed(()=>res.value?toolResult(res.value):null);
const resultText=computed(()=>res.value?stepText(res.value):'');
const resultEdits=computed(()=>res.value?fileEdits(res.value):[]);
const args=computed(()=>props.step.block?.arguments??{});
const edits=computed(()=>fileEdits(props.step));
const text=computed(()=>stepText(props.step));
// Copied and shown raw: a call with what came back from it.
const fullText=computed(()=>isResult.value||!resultText.value?text.value:`${text.value}\n\n${resultText.value}`);
const state=computed(()=>output.value?.process?.status??result.value?.status);
const stateLabel=computed(()=>({success:tr('完成','Completed'),running:tr('运行中','Running'),exited:tr('已退出','Exited'),killed:tr('已终止','Terminated'),failed:tr('失败','Failed'),cancelled:tr('已取消','Cancelled'),unknown:tr('状态未知','Unknown')})[state.value as string]??state.value);
const imageSrc=computed(()=>{const hash=String(output.value?.session_path??'').split(/[\\/]/).at(-1);return props.session&&hash&&/^[a-f0-9]{64}$/.test(hash)?blobUrl(`${props.session}/${hash}`):'';});
const isShellTool=computed(()=>name.value?.startsWith('shell_'));
const isHistoryTool=computed(()=>name.value?.startsWith('history_'));
// A search's results as the page shows them: kept on the result beside what the model read.
const searchFound=computed(()=>res.value?searchResults(res.value):null);
const hostOf=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
const fields=computed(()=>Object.entries(args.value).filter(([key])=>!(isShellTool.value&&key==='command')));
const printable=(value:any)=>typeof value==='string'?value:JSON.stringify(value,null,2);
const fieldName=(key:string)=>({operation:tr('操作','Operation'),path:tr('文件','File'),diff:tr('编辑文件','Edited files'),check_diff:tr('向模型返回差异','Diff returned to model'),timeout:tr('等待时间（秒）','Wait (seconds)'),execution_id:tr('进程标识','Execution ID'),command:tr('命令','Command'),text:tr('检索文本','Search text'),sequence:tr('序号','Sequence'),query:tr('查询','Query'),limit:tr('数量上限','Limit'),order:tr('排序','Order'),before:tr('向前展开','Before'),after:tr('向后展开','After'),mode:tr('模式','Mode'),allowed_domains:tr('只看这些网站','Only these sites'),blocked_domains:tr('排除这些网站','Never these sites'),recency:tr('时间范围','Period'),max_results:tr('结果数','Results')})[key]??key;
</script>
<template>
  <div v-if="diffOnly&&edits.length" class="file-diffs"><FileDiff v-for="(edit,index) in edits" :key="index" :edit="edit"/></div>
  <div v-else-if="isReasoning" class="reasoning-document"><Markdown v-if="text" :text="text"/><p v-else class="detail-muted">{{tr('此思考块没有可显示的文本。','This reasoning block has no displayable text.')}}</p></div>
  <template v-else>
   <template v-if="!isResult">
    <section v-if="isShellTool&&args.command" class="tool-section"><h3>{{tr('命令','Command')}}</h3><pre class="terminal-output">{{args.command}}</pre></section>
    <dl v-if="fields.length" class="tool-fields"><div v-for="[key,value] in fields" :key="key"><dt>{{fieldName(key)}}</dt><dd>{{printable(value)}}</dd></div></dl>
   </template>
   <section v-else-if="step.entry.payload?.command" class="tool-section"><h3>{{tr('命令','Command')}}</h3><pre class="terminal-output">{{step.entry.payload.command}}</pre></section>
   <template v-if="res">
   <h3 v-if="!isResult" class="tool-result-title">{{tr('结果','Result')}}</h3>
   <div class="tool-status"><span v-if="stateLabel" :class="{failed:result?.status==='failed'||(output?.process?.exit_code!=null&&output.process.exit_code!==0)}">{{stateLabel}}</span><span v-if="output?.process?.exit_code!=null">{{tr('退出码','Exit code')}} {{output.process.exit_code}}</span><span v-if="output?.byte_count!=null">{{fmtBytes(output.byte_count)}}</span></div>
   <p v-if="result?.message" class="tool-error">{{result.message}}</p>
   <template v-if="isShellTool&&output?.process">
    <dl class="tool-fields"><div v-if="output.execution_id"><dt>{{tr('进程标识','Execution ID')}}</dt><dd>{{output.execution_id}}</dd></div><div v-if="output.output_path"><dt>{{tr('完整输出文件','Output file')}}</dt><dd>{{output.output_path}}</dd></div></dl>
    <section v-if="output.text" class="tool-section"><h3>{{output.encoding==='base64'?tr('输出（Base64）','Output (Base64)'):tr('输出','Output')}}</h3><pre class="terminal-output">{{output.text}}</pre><p v-if="output.output_notice" class="detail-muted">{{tr('此处显示部分输出，完整内容保存在输出文件中。','Partial output shown. Full content is available in the output file.')}}</p></section><p v-if="output.process.error" class="tool-error">{{output.process.error}}</p>
   </template>
   <template v-else-if="name==='view_image'&&result?.status==='success'">
    <ToolImage v-if="imageSrc" :src="imageSrc" :mime="output.mime_type" :path="output.path"/>
    <p v-else class="detail-muted">{{tr('此结果没有已保存的图片引用。','No saved image reference is available for this result.')}}</p>
    <p class="detail-muted">{{output.mime_type}}</p>
   </template>
   <template v-else-if="searchFound">
    <p class="detail-muted">{{tr(`${searchFound.results.length} 条结果`,`${searchFound.results.length} result${searchFound.results.length===1?'':'s'}`)}} · {{searchFound.provider_name}}</p>
    <p v-for="(warning,index) in searchFound.warnings??[]" :key="'w'+index" class="detail-muted">{{warning}}</p>
    <ol class="search-hits"><li v-for="(hit,index) in searchFound.results" :key="index"><a :href="hit.url" target="_blank" rel="noreferrer">{{hit.title||hit.url}}</a><small>{{[hit.site||hostOf(hit.url),hit.published].filter(Boolean).join(' · ')}}</small><p v-if="hit.snippet">{{hit.snippet}}</p></li></ol>
   </template>
   <template v-else-if="isHistoryTool&&Array.isArray(output?.items)">
    <p class="detail-muted">{{output.items.length}} {{tr('条记录','records')}}<span v-if="output.has_more"> · {{tr('还有更多结果','More results available')}}</span></p>
    <article v-for="(item,index) in output.items" :key="index" class="history-hit"><strong>#{{item.sequence??item.record?.sequence??index}}</strong><p v-if="item.snippet">{{item.snippet}}</p><pre v-else>{{printable(item)}}</pre></article>
   </template>
   <pre v-else-if="!result?.message" class="terminal-output">{{resultText}}</pre>
   <div v-if="resultEdits.length" class="file-diffs"><FileDiff v-for="(edit,index) in resultEdits" :key="index" :edit="edit"/></div>
   </template>
   <p v-else class="detail-muted">{{tr('还没有结果。','No result yet.')}}</p>
  </template>
  <details v-if="!isReasoning&&!diffOnly" class="raw-tool"><summary>{{tr('原始数据','Raw data')}}</summary><pre>{{fullText}}</pre></details>
</template>
