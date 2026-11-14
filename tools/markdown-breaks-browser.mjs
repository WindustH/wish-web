import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browserFixture } from './browserFixture.mjs';

const source =
  '| 概念 | 说明 |\n| --- | --- |\n| 操作系统 | 管理硬件资源的程序集，同时向应用程序提供系统服务。<br>📖 **参考：** [ch01-OSIntroduction.pdf 第 42 页](/tmp/ch01-OSIntroduction.pdf#page=42) |\n| 命令解释器 | 命令解释器（Shell）的核心职责是读取并执行用户输入的下一条命令。<br />📖 **参考：** [ch02-OperatingSystemStructure.pdf](/tmp/ch02-OperatingSystemStructure.pdf) |\n\n代码中的标签仍然是文字：`<br>`。';
const html = `<!doctype html><html data-theme="dark"><body><main id="app" style="max-width:1000px;padding:24px"></main><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import Markdown from '/src/ui/components/Markdown.vue';
import {markdownSelection} from '/src/ui/markdownSelection.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
const source=${JSON.stringify(source)},text=ref(source);
createApp({render:()=>h(Markdown,{text:text.value,streaming:true})}).mount('#app');
window.fixture={text,source,nextTick,extract(selector){const range=document.createRange();range.selectNodeContents(document.querySelector(selector));return markdownSelection(range,document.querySelector('#app'),range.toString());}};
</script></body></html>`;

await browserFixture(html, async ({ js, until, send }) => {
  await until('document.querySelectorAll("td br").length===2', 'explicit table line breaks');
  assert.equal(await js('document.querySelector("table").textContent.includes("<br")'), false);
  assert.equal(await js('document.querySelector("p code").textContent'), '<br>');
  assert.equal(await js('document.querySelectorAll("a.file-mention").length'), 2);
  assert.ok(
    await js(
      `(()=>{const cell=document.querySelectorAll('td')[1],first=cell.querySelector('span[data-md]'),link=cell.querySelector('a');return link.getBoundingClientRect().top>first.getBoundingClientRect().top+10})()`,
    ),
    'reference appears on a second line',
  );
  assert.equal(await js('fixture.extract("tr:nth-child(1)")'), '| 概念 | 说明 |');
  assert.equal(await js('fixture.extract("tbody tr")'), source.split('\n')[2]);
  assert.equal(await js('fixture.extract(".markdown")'), source, 'copy/reply preserves original break tags');
  await js(
    'window.firstTable=document.querySelector("table");fixture.text.value=fixture.source+"\\n\\n继续输出";fixture.nextTick()',
  );
  assert.equal(await js('firstTable===document.querySelector("table")'), true, 'unchanged streaming table retains DOM');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/wish-markdown-breaks.png', Buffer.from(screenshot.data, 'base64'));
  await js('fixture.text.value="before<br";fixture.nextTick()');
  assert.equal(await js('document.querySelectorAll("br").length'), 0);
  await js('fixture.text.value="before<br>after";fixture.nextTick()');
  assert.equal(await js('document.querySelectorAll("br").length'), 1, 'streaming break completes');
  assert.equal(await js('fixture.extract("p")'), 'before<br>after');
  await js('fixture.text.value="<br onclick=alert(1)><script>alert(1)</script>";fixture.nextTick()');
  assert.equal(await js('document.querySelector(".markdown").querySelectorAll("br,script").length'), 0);
  console.log(
    'Markdown explicit breaks: table layout, file mentions, code literals, source selection/copy, streaming and escaped HTML passed',
  );
});
