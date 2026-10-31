import assert from 'node:assert/strict';
import test from 'node:test';
import MarkdownIt from 'markdown-it';
import { cjkEmphasis } from '../src/ui/markdownEmphasis.ts';

const standard = new MarkdownIt();
const markdown = new MarkdownIt().use(cjkEmphasis);

test('bold parentheses and quotes next to CJK prose use normal strong tokens', () => {
  for (const [source, expected] of [
    [
      '**Socket（套接字）**是计算机网络通信的核心概念。',
      '<strong>Socket（套接字）</strong>是计算机网络通信的核心概念。',
    ],
    ['中文**“端点（Endpoint）”**和接口', '中文<strong>“端点（Endpoint）”</strong>和接口'],
    ['调用**connect()**建立连接', '调用<strong>connect()</strong>建立连接'],
    ['中文**（说明）**后文', '中文<strong>（说明）</strong>后文'],
    ['**Socket（套接字）**𠀀', '<strong>Socket（套接字）</strong>𠀀'],
    ['𠀀**（说明）**𠀁', '𠀀<strong>（说明）</strong>𠀁'],
    ['**接続（Socket）**する', '<strong>接続（Socket）</strong>する'],
    ['**소켓(Socket)**은', '<strong>소켓(Socket)</strong>은'],
  ]) {
    assert.equal(markdown.renderInline(source!), expected, source);
  }
});

test('nested emphasis and inline code remain structured', () => {
  assert.equal(markdown.renderInline('***Socket（套接字）***是'), '<em><strong>Socket（套接字）</strong></em>是');
  assert.equal(
    markdown.renderInline('**`connect()`（连接）**之后'),
    '<strong><code>connect()</code>（连接）</strong>之后',
  );
  assert.equal(markdown.renderInline('**Socket（*套接字*）**是'), '<strong>Socket（<em>套接字</em>）</strong>是');
});

test('ordinary Markdown, whitespace, escapes and code retain their existing meaning', () => {
  for (const source of [
    '**IP 地址**：定位主机',
    '**端口号（Port）**：内部的**分机号**',
    '一个**五元组**唯一确定',
    '**Socket**是',
    '** 加粗文字 **',
    '**未完成（套接字）',
    '*（套接字）*是',
    'foo**(bar)**baz',
    'foo_(bar)_baz',
    '**bold *nested* text**',
    '****',
    '**a** **b**',
    String.raw`\*\*Socket（套接字）\*\*是`,
    '`**Socket（套接字）**是`',
    '```text\n**Socket（套接字）**是\n```',
    '[Socket](https://example.com/**socket**)',
    '![**Socket（套接字）**](https://example.com/a.png)',
  ])
    assert.equal(markdown.render(source), standard.render(source), source);
});

test('HTML stays escaped when its text contains CJK emphasis', () => {
  assert.equal(
    markdown.renderInline('<script>**Socket（套接字）**是</script>'),
    '&lt;script&gt;<strong>Socket（套接字）</strong>是&lt;/script&gt;',
  );
});
