<script setup lang="ts">
// 真实连接诊断（全部只读）：核心模块加载、i18n/主题切换、平台存储、
// wishd /version 与 /sessions 读、providerd 直连健康与目录读、
// /sync/events SSE 收到首个事件后立即关闭 reader。
//
// 约束：不创建会话、不调用模型、不修改任何后端配置；失败如实显示为
// fail 并带中文人话，绝不伪造 pass。离开页面或重新运行会取消在飞的
// stream、请求与各自的计时器（每个资源持有自己的清理句柄，晚到的旧
// 请求不会碰新请求的资源）。结果写入 window.__selftestResult（固定形状）：
//   { allPass, pass, total, results: [{ key, status: 'pass'|'fail'|'skip',
//     ms, detail }] }
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { i18n } from '../../core/i18n/index.js';
import { theme } from '../../core/theme/index.js';
import { cfg } from '../../core/config.js';
import { platform } from '../../platform/index.js';
import { createSse } from '../../core/api/sse.js';
import { get, providerd, absUrl } from '../../core/api/client.js';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';

interface Entry { key: string; status: 'pending' | 'running' | 'pass' | 'fail' | 'skip'; ms?: number; detail?: string }

const route = useRoute();
const results = ref<Entry[]>([]);
const running = ref(false);

// 本页新增的检查没有 i18n 词条（其余沿用 selftest.* 字典键）。
const LABELS: Record<string, string> = {
  'selftest.providerd': 'providerd 直连健康与目录',
};
const label = (key: string) => LABELS[key] ?? i18n.t(key);

const CHECK_TIMEOUT_MS = 15_000;      // 单项独立超时
const SSE_FIRST_EVENT_MS = 12_000;    // SSE 首个事件上限

let runGen = 0;                       // 卸载/重跑即作废所有在飞结果

// 本次运行的清理注册表：每个资源注册自己的取消动作，晚到的旧请求只
// 清理自己注册过的句柄，绝无共享可被误清的计时器槽。
const cancels = new Set<() => void>();
function registerCancel(fn: () => void): () => void {
  cancels.add(fn);
  return () => { cancels.delete(fn); };
}

function cancelInFlight() {
  runGen += 1;
  for (const fn of cancels) {
    try { fn(); } catch (e) { console.warn('selftest: 取消在飞资源失败', e); }
  }
  cancels.clear();
}

onBeforeUnmount(() => { cancelInFlight(); running.value = false; });

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      off();
      reject(new Error(`${what}超时（>${CHECK_TIMEOUT_MS / 1000} 秒）`));
    }, CHECK_TIMEOUT_MS);
    let off: () => void = () => {};
    off = registerCancel(() => clearTimeout(timer));
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);       // 只清理本调用自己的计时器
      off();
      fn();
    };
    p.then((v) => settle(() => resolve(v)), (e) => settle(() => reject(e)));
  });
}

interface Getter { get(path: string, opts?: { signal?: AbortSignal }): Promise<any> }

/** 只读 GET：超时 + 卸载中止 + 注册表清理。 */
async function getJson(client: Getter, path: string, what: string): Promise<any> {
  const ac = new AbortController();
  let off: () => void = () => {};
  off = registerCancel(() => ac.abort());
  try {
    return await withTimeout(client.get(path, { signal: ac.signal }), what);
  } finally {
    off();
    ac.abort();   // 已完成的请求中止是空操作；超时/卸载路径真正取消
  }
}

interface Check { key: string; optional?: boolean; run: (stillActive: () => boolean) => Promise<string> }

const CHECKS: Check[] = [
  {
    key: 'selftest.mod',
    run: async (stillActive) => {
      // import.meta.glob is resolved at build time: the map covers every
      // core/platform module of the shipped graph, so a broken or partial
      // asset deployment fails here instead of silently loading nothing.
      const modules = {
        ...import.meta.glob('../../core/**/*.js'),
        ...import.meta.glob('../../platform/**/*.js'),
      };
      const entries = Object.entries(modules);
      if (entries.length < 8) throw new Error(`模块图只有 ${entries.length} 个入口`);
      for (const [, load] of entries) {
        if (!stillActive()) throw new Error('页面已离开，模块图检查中止');
        await (load as () => Promise<unknown>)();
      }
      return `${entries.length} 个核心模块加载成功`;
    },
  },
  {
    key: 'selftest.i18n',
    run: async () => {
      const original = i18n.locale.value;
      const tick = () => new Promise((r) => setTimeout(r, 0));
      try {
        for (const l of cfg.i18n.locales) {
          if (!i18n.setLocale(l)) throw new Error(`setLocale(${l}) 被拒绝`);
          if (!i18n.t('app.name')) throw new Error('t() 返回空');
          await tick();
          if (document.documentElement.lang !== l) {
            throw new Error(`setLocale(${l}) 后 html.lang=${document.documentElement.lang}`);
          }
        }
        return `zh/en 往返正常，html.lang=${document.documentElement.lang}`;
      } finally {
        i18n.setLocale(original);
        await tick();
      }
    },
  },
  {
    key: 'selftest.theme',
    run: async () => {
      // 恢复用户原来的选择，而不是配置默认值。
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
        return `data-theme 依次切换 ${modes.join('/')} 正常，已还原 ${original}`;
      } finally {
        theme.setMode(original);
      }
    },
  },
  {
    key: 'selftest.storage',
    run: async () => {
      const s = platform('storage');
      // 唯一探针键：不读不写用户可能已有的固定键。
      const key = `selftest.probe.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
      try {
        s.set(key, 'ok');
        const v = s.get(key);
        if (v !== 'ok') throw new Error(`读写回环=${String(v)}`);
        return '写入→读取→删除 成功';
      } finally {
        s.remove(key);
      }
    },
  },
  {
    key: 'selftest.api',
    run: async () => {
      const v = await getJson({ get }, '/version', '读取 wishd /version ');
      if (!v || !v.name) throw new Error('/version 响应缺少 name');
      return `wishd ${v.name} ${v.version ?? '?'}`;
    },
  },
  {
    key: 'selftest.sessions',
    run: async () => {
      const page = await getJson({ get }, '/sessions?limit=1', '读取 /sessions ');
      if (!Array.isArray(page.items)) throw new Error('响应缺少 items 数组');
      return `读到 ${page.items.length} 行（只读，未创建会话）`;
    },
  },
  {
    key: 'selftest.providerd',
    run: async () => {
      const ver = await getJson(providerd, '/version', '读取 providerd /version ');
      if (!ver || !ver.name) throw new Error('providerd /version 响应缺少 name');
      const configs = await getJson(providerd, '/provider-configs', '读取 provider 目录 ');
      const providers = configs?.providers;
      if (!Array.isArray(providers)) throw new Error('provider-configs 响应缺少 providers 数组');
      return `${ver.name} ${ver.version ?? '?'} · 目录 ${providers.length} 个 provider`;
    },
  },
  {
    key: 'selftest.sse',
    run: async () => {
      const first = await new Promise<string>((resolve, reject) => {
        let done = false;
        let off: () => void = () => {};
        const timer = setTimeout(() => finish(new Error(`首个事件超时（>${SSE_FIRST_EVENT_MS / 1000} 秒）`)), SSE_FIRST_EVENT_MS);
        const sse = createSse({
          url: absUrl('/sync/events'),
          firstTimeoutMs: cfg.sse.firstFrameTimeoutMs,
          headers: {},
          onFrame: (f: { event?: string }) => { if (f.event) finish(undefined, f.event); },
          onState: ({ state, err }: { state: string; err?: { status?: number; message?: string } }) => {
            if (state === 'denied') finish(new Error(`鉴权失败：${err?.status ?? ''} ${err?.message ?? ''}`.trim()));
            else if (state === 'closed') finish(new Error('连接在收到事件前被关闭'));
          },
        });
        off = registerCancel(() => { clearTimeout(timer); sse.close(); });
        function finish(err?: Error, event?: string) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          off();
          sse.close();                 // reader 立即取消，不留连接
          if (err) reject(err); else resolve(event!);
        }
      });
      return `收到首个事件 ${first}，reader 已关闭`;
    },
  },
  {
    key: 'selftest.sw',
    optional: true,
    run: async () => {
      if (!('serviceWorker' in navigator)) return i18n.t('selftest.swUnsupported');
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? `已注册：${reg.scope}` : '未注册（首次加载，不算失败）';
    },
  },
];

async function runAll() {
  cancelInFlight();                   // 作废上一次在飞的一切
  const gen = runGen;
  const stillActive = () => gen === runGen;
  running.value = true;
  results.value = CHECKS.map((c) => ({ key: c.key, status: 'pending' as const }));
  const out: Entry[] = [];
  for (const c of CHECKS) {
    if (!stillActive()) return;       // 页面已卸载或已重跑：停止
    const t0 = performance.now();
    const entry: Entry = { key: c.key, status: 'running' };
    results.value = [...results.value.filter((r) => r.key !== c.key), entry];
    try {
      const detail = await c.run(stillActive);
      entry.status = 'pass';
      entry.detail = detail;
    } catch (err: any) {
      entry.status = c.optional ? 'skip' : 'fail';
      entry.detail = String(err?.message ?? err);
    }
    entry.ms = Math.round(performance.now() - t0);
    out.push(entry);
    if (!stillActive()) return;
    results.value = [...results.value.filter((r) => r.key !== c.key), entry];
  }
  if (!stillActive()) return;
  running.value = false;
  const pass = out.filter((x) => x.status === 'pass').length;
  (window as any).__selftestResult = {
    pass,
    total: out.filter((x) => x.status !== 'skip').length,
    allPass: out.every((x) => x.status === 'pass' || x.status === 'skip'),
    results: out,
  };
}

const passCount = computed(() => results.value.filter((r) => r.status === 'pass' || r.status === 'skip').length);
const failCount = computed(() => results.value.filter((r) => r.status === 'fail').length);
const itemClass = (s: Entry['status']) => (s === 'pass' ? 'pass' : s === 'fail' ? 'fail' : 'pending');

onMounted(() => { if (route.query.auto === '1') runAll(); });
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ i18n.t('selftest.title') }}</h1>
      <span class="st-summary" :class="{ bad: failCount > 0 }">
        {{ i18n.t('selftest.summary', { pass: passCount, total: results.length }) }}
      </span>
      <button class="btn primary" :disabled="running" @click="runAll">
        {{ running ? i18n.t('selftest.running') : i18n.t('selftest.run') }}
      </button>
    </div>
    <div class="st-list">
      <div class="st-desc">{{ i18n.t('selftest.desc') }}</div>
      <div v-for="r in results" :key="r.key" class="st-item" :class="itemClass(r.status)">
        <span class="st-ic">
          <Icon v-if="r.status === 'pass'" name="check" />
          <Icon v-else-if="r.status === 'fail'" name="x" />
          <Spinner v-else-if="r.status === 'running'" />
        </span>
        <span class="st-name">{{ label(r.key) }}</span>
        <span class="st-detail">
          <template v-if="r.status === 'skip'">{{ i18n.t('selftest.swUnsupported') }}</template>
          <template v-else>{{ r.detail || '' }}</template>
          <template v-if="r.ms != null && r.status !== 'running'"> · {{ r.ms }}ms</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-summary { font-size: 12px; color: var(--fg-faint); }
.st-summary.bad { color: var(--err); }
.st-desc { font-size: 13px; color: var(--fg-subtle); }
.st-item .st-ic :deep(svg) { width: 12px; height: 12px; }
.st-item .st-ic :deep(.spinner) { width: 12px; height: 12px; }
</style>
