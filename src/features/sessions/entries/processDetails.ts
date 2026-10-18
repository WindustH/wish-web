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
/**
 * What a run of steps did, said in a line: "ran 3 commands, searched the web". A command's polls,
 * input and stop count with the command; tools of their own are named; only thinking is said as such.
 */
export function summarizeSteps(steps:any[], zh:boolean):string {
  const calls=new Map<string,number>();
  for(const step of steps){
    if(step.kind!=='block'||step.block?.type!=='tool_call')continue;
    const name=stepToolName(step)??'';
    calls.set(name,(calls.get(name)??0)+1);
  }
  const count=(...names:string[])=>names.reduce((sum,name)=>sum+(calls.get(name)??0),0);
  const files=new Set(steps.flatMap(step=>fileEdits(step).map((edit:any)=>edit.path))).size||count('shell_edit');
  const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
  const parts:string[]=[];
  const commands=count('shell_start','shell');
  if(commands)parts.push(zh?`运行了 ${commands} 条命令`:`ran ${plural(commands,'command')}`);
  if(files)parts.push(zh?`修改了 ${files} 个文件`:`edited ${plural(files,'file')}`);
  const searches=count('web_search');
  if(searches)parts.push(zh?(searches===1?'搜索了网页':`搜索了 ${searches} 次网页`):(searches===1?'searched the web':`searched the web ${searches} times`));
  if(count('history_search','history_read','history_query'))parts.push(zh?'查阅了会话历史':'looked through the history');
  const images=count('view_image');
  if(images)parts.push(zh?`查看了 ${images} 张图片`:`viewed ${plural(images,'image')}`);
  for(const name of calls.keys()){
    if(name.startsWith('shell')||name.startsWith('history_')||['web_search','view_image','ask_user'].includes(name))continue;
    parts.push(zh?`调用了 ${toolTitle(name)}`:`used ${toolTitle(name)}`);
  }
  if(!parts.length)return zh?'思考了一会儿':'Thought it over';
  const line=parts.join(zh?'、':', ');
  return zh?line:line[0]!.toUpperCase()+line.slice(1);
}
/** The kinds of thing a run of steps did, as icons in the order they first came: a command, a file
 *  edited, the web searched... Only thinking shows as thinking. A few at most. */
export function stepIcons(steps:any[]):string[] {
  const icons:string[]=[];
  for(const step of steps){
    if(step.kind!=='block'||step.block?.type!=='tool_call')continue;
    const name=stepToolName(step);
    const icon=name==='shell_edit'?'file-diff':toolIcon(name);
    if(!icons.includes(icon))icons.push(icon);
  }
  return icons.length?icons.slice(0,4):['thinking'];
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
