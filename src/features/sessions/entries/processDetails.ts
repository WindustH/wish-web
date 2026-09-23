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
export function fileEdit(step:any):any {
  const name = step.entry?.payload?.tool_name;
  if(!name?.startsWith('shell_')) return null;
  const value=toolOutput(step);
  return value?.edit??value?.process?.edit??null;
}
export interface DiffLine {text:string;kind:'add'|'remove'|'context'|'meta';before:number|null;after:number|null}
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
