export function stepText(step:any):string {
  if(step.kind==='entry')return (step.entry.payload?.content??[]).map((block:any)=>block.text??'').join('\n');
  if(step.block?.type==='tool_call')return JSON.stringify(step.block.arguments??{},null,2);
  return step.block?.text??'';
}
export function toolResult(step:any):any {
  if(step.kind!=='entry')return null;
  const value=step.entry.payload?.result;
  if(value!==undefined&&typeof value!=='string')return value;
  try{return JSON.parse(value??stepText(step));}catch{return null;}
}
export function toolOutput(step:any):any {const result=toolResult(step);return result?.output??result;}
/** Where a step stands in the history: its result entry's sequence, or the sequence its block came from. */
export const stepSeq=(step:any):number|undefined=>step.kind==='entry'?step.entry.seq:step.fromSeq;
/** The tool a step is about: the one a result answers, or the one a call names. */
export const stepToolName=(step:any):string|undefined=>step.kind==='entry'?step.entry.payload?.tool_name:step.block?.type==='tool_call'?step.block.name||step.block.tool_name:undefined;
/** What a web search step kept for the page - its provider and results - or null. */
export const searchResults=(step:any)=>step.kind==='entry'&&step.entry.payload?.tool_name==='web_search'&&Array.isArray(step.entry.payload?.metadata?.results)?step.entry.payload.metadata:null;
// Built-in tools by the names people read, in English whatever the language; any other tool keeps its own.
const TOOL_TITLES:Record<string,string>={
  shell_start:'Run Command',shell_poll:'Check Command',shell_write:'Send Input',shell_kill:'Stop Command',shell_edit:'Edit Files',shell:'Shell',
  history_search:'Search History',history_read:'Read History',history_query:'Query History',view_image:'View Image',ask_user:'Ask User',web_search:'Web Search',
};
export const toolTitle=(name?:string)=>name?TOOL_TITLES[name]??name:'';
export function toolIcon(name?:string):string {
  if(name?.startsWith('shell'))return 'terminal';
  if(name==='view_image')return 'image';
  if(name?.startsWith('history_'))return 'search';
  if(name==='ask_user')return 'question';
  if(name==='web_search')return 'globe';
  return 'tool';
}
// Full diffs live in the result's metadata when the model did not ask to see them.
export function fileEdits(step:any):any[] {
  if(step.entry?.payload?.tool_name!=='shell_edit') return [];
  const edits=step.entry.payload?.metadata?.edits??toolOutput(step)?.edits;
  return Array.isArray(edits)?edits:[];
}
export interface DiffLine {text:string;kind:'add'|'remove'|'context'|'meta';before:number|null;after:number|null}
/** How many lines a parsed diff adds and removes. */
export const diffCounts=(lines:DiffLine[])=>({added:lines.filter(line=>line.kind==='add').length,removed:lines.filter(line=>line.kind==='remove').length});
export function parseDiff(diff:string):DiffLine[]{
  let before=0,after=0,inHunk=false;
  const lines=diff.split('\n');if(lines.at(-1)==='')lines.pop();
  return lines.map(text=>{
    const match=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if(match){before=Number(match[1]);after=Number(match[2]);inHunk=true;return {text,kind:'meta',before:null,after:null};}
    if(!inHunk||text.startsWith('\\'))return {text,kind:'meta',before:null,after:null};
    if(text.startsWith('+'))return {text,kind:'add',before:null,after:after++};
    if(text.startsWith('-'))return {text,kind:'remove',before:before++,after:null};
    if(text.startsWith(' '))return {text,kind:'context',before:before++,after:after++};
    return {text,kind:'meta',before:null,after:null};
  });
}
