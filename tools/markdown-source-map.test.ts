import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {markdownSourceMap,sourceLocation} from '../src/ui/markdownSourceMap.ts';
import {cjkEmphasis} from '../src/ui/markdownEmphasis.ts';
test('installing source mapping twice preserves offsets and rendering', () => {
 const mapped = new MarkdownIt().use(markdownSourceMap);
 const source = '> repeated **words** &amp; text';
 const before = mapped.render(source);
 const runs = mapped.parse(source, {}).flatMap(token => token.children ?? []).map(sourceLocation);
 mapped.use(markdownSourceMap);
 assert.equal(mapped.render(source), before);
 assert.deepEqual(mapped.parse(source, {}).flatMap(token => token.children ?? []).map(sourceLocation), runs);
});
const cases=[
 '# Heading\n\nParagraph **bold** _italic_ ~~strike~~.',
 'Escaped \\* &amp; &#x1F600; and ` code ` and ``a`b``.',
 'Smart "quotes" ... --- -- (c) +- ???? !!!!!! ,,',
 '[x](https://example.com "title") and <a@b.com> https://example.com www.example.com',
 '&copy;www.example.com',
 '> quote\n>\n> - list\n>   - **nested**\n\n    code\n',
 '| a | b |\n| - | - |\n| x\\|y | **bold** |',
 '![alt **bold**](image.png)',
 '[ref][id]\n\n[id]: https://example.com',
 '中文**（粗体）**，正常。',
 'a  \nb\\\nc\n\n***nested*** and ___nested___',
 '*** unmatched ** text * __ _ ~~~',
];
for(const source of cases) test(`source mapping preserves rendering: ${source.slice(0,40)}`,()=>{
 const plain=new MarkdownIt({typographer:true,linkify:true}).use(cjkEmphasis);
 const mapped=new MarkdownIt({typographer:true,linkify:true}).use(cjkEmphasis).use(markdownSourceMap);
 assert.equal(mapped.render(source),plain.render(source));
});

test('source runs stay compact for long literal text',()=>{
 const mapped=new MarkdownIt().use(markdownSourceMap);
 const token=mapped.parse('a'.repeat(100_000),{})[1]!.children![0]!;
 assert.equal(sourceLocation(token)!.runs!.length,1);
 assert.equal(sourceLocation(token)!.runs![0]!.length,100_000);
});
test('many escapes and line offsets use bounded, indexed source runs',()=>{
 const mapped=new MarkdownIt({typographer:true}).use(markdownSourceMap);
 const source=('(c) ... &amp; \\*\n').repeat(4000);
 const start=performance.now();
 const tokens=mapped.parse(source,{});
 const elapsed=performance.now()-start;
 assert.equal(tokens.length,3);
 assert.ok(elapsed<2000,`mapping ${source.length} characters took ${elapsed}ms`);
 console.log(`source-map stress: ${source.length} chars, ${elapsed.toFixed(1)}ms`);
});

test('link normalization tolerates missing source runs',()=>{
 const mapped=new MarkdownIt({linkify:true}).use(markdownSourceMap);
 mapped.normalizeLinkText=()=> 'normalized';
 mapped.core.ruler.after('inline','incomplete_mapping',state=>{
  for(const block of state.tokens) for(const child of block.children??[]) {
   const location=sourceLocation(child);if(location)location.runs=[];
  }
 });
 assert.doesNotThrow(()=>mapped.render('www.example.com'));
});
