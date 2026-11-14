import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { markdownBreaks } from '../src/ui/markdownBreaks.ts';
import { markdownSourceMap, sourceLocation } from '../src/ui/markdownSourceMap.ts';

const markdown = () => new MarkdownIt({ html: false, breaks: true }).use(markdownBreaks);

test('explicit breaks render in table cells, paragraphs and inline formatting', () => {
  for (const tag of ['<br>', '<br/>', '<br />', '<BR>', '<Br\t/>']) {
    const text = `| Definition | Reference |\n| - | - |\n| First${tag}Second | **Title${tag}page** |`;
    const html = markdown().render(text);
    assert.equal((html.match(/<br>/g) ?? []).length, 2);
    assert.match(html, /<td>First<br>\nSecond<\/td>/);
    assert.match(html, /<strong>Title<br>\npage<\/strong>/);
    assert.equal(markdown().render(`First${tag}Second`), '<p>First<br>\nSecond</p>\n');
  }
});

test('HTML, attributes, escaped tags, inline code and code fences stay literal', () => {
  for (const text of [
    '`<br>`',
    '```html\n<br>\n```',
    '\\<br>',
    '&lt;br&gt;',
    '<br class="line">',
    '<br onclick="alert(1)">',
    '<br/onclick="alert(1)">',
    '<br',
    '</br>',
    '<bravo>',
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
  ]) {
    const html = markdown().render(text);
    assert.equal(html, new MarkdownIt({ html: false, breaks: true }).render(text), text);
    assert.doesNotMatch(html, /<br>|<script>|<img/);
  }
});

test('break source mappings preserve exact table and following-text offsets', () => {
  const source = '| a | b |\n| - | - |\n| one<br />**two** | three<BR>four |';
  const mapped = markdown().use(markdownSourceMap);
  assert.equal(mapped.render(source), markdown().render(source));
  const tokens = mapped.parse(source, {}).flatMap((token) => token.children ?? []);
  const breaks = tokens.filter((token) => token.type === 'hardbreak');
  assert.deepEqual(
    breaks.map((token) => {
      const location = sourceLocation(token)!;
      return source.slice(location.start, location.end);
    }),
    ['<br />', '<BR>'],
  );
  const following = tokens.find((token) => token.type === 'text' && token.content === 'four')!;
  const location = sourceLocation(following)!;
  assert.equal(source.slice(location.start, location.end), 'four');
});
