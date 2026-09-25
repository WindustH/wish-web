<script setup lang="ts">
import { computed } from 'vue';
import { parseDiff } from './processDetails.ts';
import CopyButton from '../../../ui/components/CopyButton.vue';
import { i18n } from '../../../core/i18n/index.ts';
const props=defineProps<{edit:any}>();
const tx=(zh:string,en:string)=>i18n.locale.value==='zh'?zh:en;
const lines=computed(()=>parseDiff(props.edit.diff??''));
const added=computed(()=>lines.value.filter(line=>line.kind==='add').length);
const removed=computed(()=>lines.value.filter(line=>line.kind==='remove').length);
</script>
<template>
 <section class="file-diff">
  <header><span class="diff-path">{{edit.path}}</span><span v-if="edit.diff" class="diff-counts"><b class="added">+{{added}}</b><b class="removed">−{{removed}}</b></span><CopyButton v-if="edit.diff" :text="edit.diff"/></header>
  <div v-if="edit.diff" class="diff-scroll"><div class="diff-lines"><div v-for="(line,index) in lines" :key="index" class="diff-line" :class="line.kind"><span class="line-number">{{line.before}}</span><span class="line-number">{{line.after}}</span><code>{{line.text}}</code></div></div></div>
  <p v-else class="diff-message">{{edit.status==='pending'?tx('命令仍在运行，文件差异尚未生成。','Command is running; the file diff is pending.'):edit.status==='failed'?edit.error:edit.binary&&edit.changed?tx('二进制文件已更改，无法显示文本差异。','Binary file changed; a text diff is unavailable.'):tx('文件没有变化。','No file changes.')}}</p>
 </section>
</template>
<style scoped>
.file-diff{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg-inset);min-width:0}
header{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-raised);border-bottom:1px solid var(--line);font-size:12px}
.diff-path{flex:1;min-width:0;overflow-wrap:anywhere;font-family:var(--mono)}
.diff-counts{display:flex;gap:8px;white-space:nowrap}.added{color:var(--ok)}.removed{color:var(--err)}
.diff-scroll{overflow:auto;max-height:65dvh}.diff-lines{min-width:100%;width:max-content}
.diff-line{display:flex;white-space:pre;font:12px/1.8 var(--mono);min-height:1.8em}
.diff-line code{font:inherit;padding:0 12px 0 8px}.line-number{width:4em;flex:none;text-align:right;padding:0 8px;color:var(--fg-subtle);user-select:none;border-right:1px solid var(--line)}
.diff-line.add{background:color-mix(in srgb,var(--ok) 12%,transparent)}.diff-line.remove{background:color-mix(in srgb,var(--err) 12%,transparent)}.diff-line.meta{color:var(--fg-subtle);background:var(--bg-raised)}
.diff-message{font-size:13px;color:var(--fg-muted);padding:12px;margin:0}
</style>
