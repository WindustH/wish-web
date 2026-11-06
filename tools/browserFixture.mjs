// Isolated Vue browser fixtures; never connect to the user's running backend.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function browserFixture(html, run, { middleware } = {}) {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [
      vue(),
      {
        name: 'isolated-review-fixture',
        resolveId(id) {
          if (id === 'virtual:pwa-register') return '\0review-pwa';
        },
        load(id) {
          if (id === '\0review-pwa') return 'export const registerSW=()=>async()=>{}';
        },
        configureServer(server) {
          if (middleware) server.middlewares.use(middleware);
          server.middlewares.use('/__review', async (_, response) => {
            response.setHeader('content-type', 'text/html');
            response.end(await server.transformIndexHtml('/__review', html));
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: {
      entries: [
        'src/ui/components/Markdown.vue',
        'src/domain/chat/InlineMessageEditor.vue',
        'src/ui/components/Modal.vue',
      ],
      include: [
        'vue',
        'vue-router',
        'reka-ui',
        'markdown-it',
        'dompurify',
        'temml',
        '@mdit/plugin-tex',
        'highlight.js/lib/common',
        'highlight.js/lib/languages/dockerfile',
        'highlight.js/lib/languages/powershell',
        'motion-v',
      ],
    },
  });
  const profile = await mkdtemp(join(tmpdir(), 'wish-source-review-'));
  let chrome, socket;
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    chrome = spawn(
      process.env.CHROME || '/usr/bin/google-chrome-stable',
      [
        '--headless=new',
        '--no-first-run',
        '--disable-extensions',
        `--user-data-dir=${profile}`,
        '--remote-debugging-port=0',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    let debugPort;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        debugPort = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
        break;
      } catch {
        await sleep(100);
      }
    }
    assert.ok(debugPort, 'Chrome starts');
    const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    const pending = new Map(),
      exceptions = [];
    let serial = 0;
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const job = pending.get(message.id);
        pending.delete(message.id);
        message.error ? job.reject(message.error) : job.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown')
        exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const js = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails)
        throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async (expression, label) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await js(expression)) return;
        await sleep(100);
      }
      throw Error(`${label}: ${JSON.stringify(exceptions)}`);
    };
    const click = async (selector) => {
      const point = await js(
        `(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control');const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`,
      );
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/__review` });
    await until('!!window.fixture', 'fixture mounts');
    await run({ send, js, until, click, exceptions });
    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close();
    if (chrome) {
      chrome.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(2000)]);
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
    }
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
