<script setup lang="ts">
// Read-only connection diagnostics: module loading, language and theme switching,
// local storage, the server's /version, sessions and providers, the /events stream
// and the service worker. Nothing is created on the server, no model is called and
// no configuration changes. Leaving or re-running cancels every request, stream and
// timer still in flight. Results are also left in window.__selftestResult:
//   { allPass, pass, total, results: [{ key, status: 'pass'|'fail'|'skip', ms, detail }] }
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { theme } from '../../core/theme/index.ts';
import { cfg } from '../../core/config.ts';
import { platform } from '../../platform/index.ts';
import { createSse } from '../../core/api/sse.ts';
import { get, absUrl } from '../../core/api/client.ts';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ autoRun?: boolean }>();

interface Entry { key: string; status: 'pending' | 'running' | 'pass' | 'fail' | 'skip'; ms?: number; detail?: string }
interface Check { key: string; label: () => string; optional?: boolean; run: (stillActive: () => boolean) => Promise<string> }

const results = ref<Entry[]>([]);
const running = ref(false);

const CHECK_TIMEOUT_MS = 15_000;      // each check times out on its own
const SSE_FIRST_EVENT_MS = 12_000;    // the event stream must deliver within this

let runGen = 0;                       // unmounting or re-running invalidates everything in flight

// Each resource registers its own cancellation, so a late, stale request only
// clears the handles it registered itself.
const cancels = new Set<() => void>();
function registerCancel(fn: () => void): () => void {
  cancels.add(fn);
  return () => { cancels.delete(fn); };
}

function cancelInFlight() {
  runGen += 1;
  for (const fn of cancels) {
    try { fn(); } catch (e) { console.warn('diagnostics: could not cancel', e); }
  }
  cancels.clear();
}

onBeforeUnmount(() => { cancelInFlight(); running.value = false; });

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const seconds = CHECK_TIMEOUT_MS / 1000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      off();
      reject(new Error(tr(`${what}超时（超过 ${seconds} 秒）`, `${what} timed out after ${seconds} s`)));
    }, CHECK_TIMEOUT_MS);
    let off: () => void = () => {};
    off = registerCancel(() => clearTimeout(timer));
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
      fn();
    };
    p.then((v) => settle(() => resolve(v)), (e) => settle(() => reject(e)));
  });
}

/** A read-only GET with a timeout, cancelled when the run is abandoned. */
async function getJson(path: string, what: string): Promise<any> {
  const ac = new AbortController();
  let off: () => void = () => {};
  off = registerCancel(() => ac.abort());
  try {
    return await withTimeout(get(path, { signal: ac.signal }), what);
  } finally {
    off();
    ac.abort();   // a no-op for a finished request; cancels on timeout or unmount
  }
}

const CHECKS: Check[] = [
  {
    key: 'modules',
    label: () => tr('核心模块', 'Core modules'),
    run: async (stillActive) => {
      // import.meta.glob is resolved at build time: the map covers every core and
      // platform module of the shipped build, so a partial deployment fails here.
      const modules = {
        ...import.meta.glob('../../core/**/*.ts'),
        ...import.meta.glob('../../platform/**/*.ts'),
      };
      const entries = Object.entries(modules);
      if (entries.length < 8) throw new Error(tr(`构建中只有 ${entries.length} 个模块`, `Only ${entries.length} modules in the build`));
      for (const [, load] of entries) {
        if (!stillActive()) throw new Error(tr('检查已取消', 'Check cancelled'));
        await (load as () => Promise<unknown>)();
      }
      return tr(`${entries.length} 个模块全部加载`, `All ${entries.length} modules loaded`);
    },
  },
  {
    key: 'i18n',
    label: () => tr('语言切换', 'Language switching'),
    run: async () => {
      const original = i18n.locale.value;
      const tick = () => new Promise((r) => setTimeout(r, 0));
      // Messages are worded after the language is restored, so they read in the user's language.
      let problem: (() => string) | undefined;
      try {
        for (const l of cfg.i18n.locales) {
          if (!i18n.setLocale(l)) { problem = () => tr(`无法切换到 ${l}`, `Could not switch to ${l}`); break; }
          if (!i18n.t('app.name')) { problem = () => tr('翻译返回了空文本', 'A translation came back empty'); break; }
          await tick();
          const lang = document.documentElement.lang;
          if (lang !== l) { problem = () => tr(`切换到 ${l} 后 html lang 是 ${lang}`, `After switching to ${l}, html lang is ${lang}`); break; }
        }
      } finally {
        i18n.setLocale(original);
        await tick();
      }
      if (problem) throw new Error(problem());
      return tr('中文和英文往返切换正常', 'Switched to Chinese and English and back');
    },
  },
  {
    key: 'theme',
    label: () => tr('主题切换', 'Theme switching'),
    run: async () => {
      // Restore the user's own choice, not the configured default.
      const original = theme.mode.value as string;
      const modes = ['light', 'dark', 'auto'];
      const tick = () => new Promise((r) => setTimeout(r, 20));
      try {
        for (const m of modes) {
          theme.setMode(m);
          await tick();
          const attr = document.documentElement.dataset.theme;
          const expect = m === 'auto'
            ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : m;
          if (attr !== expect) throw new Error(`mode=${m} → data-theme=${attr}`);
        }
        return tr(`浅色、深色、跟随系统切换正常，已还原`, 'Switched light, dark and system, then restored');
      } finally {
        theme.setMode(original);
      }
    },
  },
  {
    key: 'storage',
    label: () => tr('本地存储', 'Local storage'),
    run: async () => {
      const s = platform('storage');
      // A key of its own: never touches keys the user may already have.
      const key = `selftest.probe.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
      try {
        s.set(key, 'ok');
        const v = s.get(key);
        if (v !== 'ok') throw new Error(tr(`读回的值是 ${String(v)}`, `Read back ${String(v)}`));
        return tr('写入、读取、删除正常', 'Write, read and delete work');
      } finally {
        s.remove(key);
      }
    },
  },
  {
    key: 'api',
    label: () => tr('服务器版本', 'Server version'),
    run: async () => {
      const v = await getJson('/version', tr('读取 /version ', 'Reading /version'));
      if (!v || !v.name) throw new Error(tr('/version 的响应缺少 name', 'The /version reply has no name'));
      return `${v.name} ${v.version ?? ''}`.trim();
    },
  },
  {
    key: 'sessions',
    label: () => tr('会话列表', 'Session list'),
    run: async () => {
      const page = await getJson('/sessions?limit=1', tr('读取会话列表', 'Reading the session list'));
      if (!Array.isArray(page.items)) throw new Error(tr('响应缺少 items 数组', 'The reply has no items array'));
      return tr('读取正常（只读，没有创建会话）', 'Readable (read-only; no session was created)');
    },
  },
  {
    key: 'providers',
    label: () => tr('模型提供商', 'Model providers'),
    run: async () => {
      const configs = await getJson('/providers', tr('读取提供商', 'Reading providers'));
      if (!Array.isArray(configs.items)) throw new Error(tr('响应缺少 items 数组', 'The reply has no items array'));
      return tr(`${configs.items.length} 个提供商`, `${configs.items.length} provider(s)`);
    },
  },
  {
    key: 'events',
    label: () => tr('实时事件流', 'Live event stream'),
    run: async () => {
      const first = await new Promise<string>((resolve, reject) => {
        let done = false;
        let off: () => void = () => {};
        const seconds = SSE_FIRST_EVENT_MS / 1000;
        const timer = setTimeout(() => finish(new Error(tr(`${seconds} 秒内没有收到事件`, `No event within ${seconds} s`))), SSE_FIRST_EVENT_MS);
        const sse = createSse({
          url: absUrl('/events'),
          firstTimeoutMs: cfg.sse.firstFrameTimeoutMs,
          headers: {},
          onFrame: (f: { event?: string }) => { if (f.event) finish(undefined, f.event); },
          onState: ({ state, err }: { state: string; err?: { status?: number; message?: string } }) => {
            if (state === 'denied') finish(new Error(`${tr('鉴权失败', 'Authentication failed')}: ${err?.status ?? ''} ${err?.message ?? ''}`.trim()));
            else if (state === 'closed') finish(new Error(tr('连接在收到事件前就关闭了', 'The connection closed before any event')));
          },
        });
        off = registerCancel(() => { clearTimeout(timer); sse.close(); });
        function finish(err?: Error, event?: string) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          off();
          sse.close();                 // close the reader at once; keep no connection open
          if (err) reject(err); else resolve(event!);
        }
      });
      return tr(`收到事件 ${first}，已断开`, `Received ${first}, then disconnected`);
    },
  },
  {
    key: 'service-worker',
    label: () => 'Service Worker',
    optional: true,
    run: async () => {
      if (!('serviceWorker' in navigator)) throw new Error(tr('此环境不支持（需要 HTTPS，不算失败）', 'Not available here (needs HTTPS; not a failure)'));
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? tr(`已注册：${reg.scope}`, `Registered: ${reg.scope}`) : tr('尚未注册（首次打开时正常）', 'Not registered yet (normal on first visit)');
    },
  },
];

async function runAll() {
  cancelInFlight();                   // abandon everything from the previous run
  const gen = runGen;
  const stillActive = () => gen === runGen;
  running.value = true;
  results.value = CHECKS.map((c) => ({ key: c.key, status: 'pending' as const }));
  const out: Entry[] = [];
  for (const c of CHECKS) {
    if (!stillActive()) return;
    const t0 = performance.now();
    const entry: Entry = { key: c.key, status: 'running' };
    results.value = results.value.map((r) => (r.key === c.key ? entry : r));
    try {
      entry.detail = await c.run(stillActive);
      entry.status = 'pass';
    } catch (err: any) {
      entry.status = c.optional ? 'skip' : 'fail';
      entry.detail = String(err?.message ?? err);
    }
    entry.ms = Math.round(performance.now() - t0);
    out.push(entry);
    if (!stillActive()) return;
    results.value = results.value.map((r) => (r.key === c.key ? { ...entry } : r));
  }
  if (!stillActive()) return;
  running.value = false;
  (window as any).__selftestResult = {
    pass: out.filter((x) => x.status === 'pass').length,
    total: out.filter((x) => x.status !== 'skip').length,
    allPass: out.every((x) => x.status === 'pass' || x.status === 'skip'),
    results: out,
  };
}

const labels = computed(() => Object.fromEntries(CHECKS.map((c) => [c.key, c.label()])));
const finished = computed(() => results.value.filter((r) => r.status === 'pass' || r.status === 'fail' || r.status === 'skip'));
const failed = computed(() => results.value.filter((r) => r.status === 'fail').length);
const summary = computed(() => {
  if (running.value) return tr(`正在检查 ${finished.value.length + 1}/${CHECKS.length}…`, `Checking ${finished.value.length + 1} of ${CHECKS.length}…`);
  if (!results.value.length) return tr('只读检查，不会创建会话、调用模型或修改配置。检查时界面语言和主题会短暂切换。', 'Read-only: creates no session, calls no model and changes no settings. The language and theme switch briefly while it runs.');
  return failed.value
    ? tr(`${failed.value} 项未通过`, `${failed.value} check(s) failed`)
    : tr(`${CHECKS.length} 项全部正常`, `All ${CHECKS.length} checks passed`);
});

onMounted(() => { if (props.autoRun) void runAll(); });
</script>

<template>
  <div class="diagnostics" :aria-busy="running">
    <div class="diagnostics-row diagnostics-action">
      <div class="diagnostics-text">
        <span>{{ tr('检查连接', 'Check the connection') }}</span>
        <small :class="{ bad: failed && !running }" role="status">{{ summary }}</small>
      </div>
      <button class="btn" :disabled="running" @click="runAll">
        <Icon :name="running ? 'loader-circle' : 'refresh-cw'" :class="{ spin: running }" />
        {{ running ? tr('检查中…', 'Checking…') : results.length ? tr('重新检查', 'Check again') : tr('开始检查', 'Run checks') }}
      </button>
    </div>
    <div v-for="r in results" :key="r.key" class="diagnostics-row" :class="r.status">
      <span class="diagnostics-status" aria-hidden="true">
        <Icon v-if="r.status === 'pass'" name="check" />
        <Icon v-else-if="r.status === 'fail'" name="x" />
        <Icon v-else-if="r.status === 'skip'" name="circle-dot" />
        <Spinner v-else-if="r.status === 'running'" />
      </span>
      <div class="diagnostics-text">
        <span>{{ labels[r.key] }}</span>
        <small v-if="r.detail">{{ r.detail }}<template v-if="r.ms != null"> · {{ r.ms }} ms</template></small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagnostics { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
.diagnostics-row { display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 10px 16px; }
.diagnostics-row + .diagnostics-row { border-top: 1px solid var(--line); }
.diagnostics-action { min-height: 58px; }
.diagnostics-action .btn { flex: none; display: inline-flex; align-items: center; gap: 6px; }
.diagnostics-action .btn .icon { width: 15px; height: 15px; }
.diagnostics-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.diagnostics-text > span { font: 500 13.5px/1.45 var(--font); color: var(--fg); }
.diagnostics-text > small { font-size: 12px; line-height: 1.5; color: var(--fg-subtle); overflow-wrap: anywhere; }
.diagnostics-text > small.bad { color: var(--err); }
.diagnostics-status { flex: none; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--bg-sunken); color: var(--fg-faint); }
.diagnostics-status :deep(svg) { width: 13px; height: 13px; }
.diagnostics-status :deep(.spinner) { width: 12px; height: 12px; }
.diagnostics-row.pass .diagnostics-status { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
.diagnostics-row.fail .diagnostics-status { background: color-mix(in srgb, var(--err) 14%, transparent); color: var(--err); }
.diagnostics-row.fail .diagnostics-text > small { color: var(--err); }
.diagnostics-row.pending .diagnostics-text > span { color: var(--fg-subtle); }
@media (max-width: 899px) {
  .diagnostics { border-radius: 14px; }
  .diagnostics-row { padding: 10px 14px; }
}
</style>
