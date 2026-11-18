<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import {
  terminalState,
  startTerminal,
  pollTerminal,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  type TerminalState,
} from '../../core/api/terminal.ts';
import '@xterm/xterm/css/xterm.css';

const props = defineProps<{ session: string; active: boolean; mobile: boolean }>();
const host = ref<HTMLElement>();
const state = ref<TerminalState | null>(null);
const loaded = ref(false),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  revision = ref(0);
let terminal: Terminal | undefined, fit: FitAddon | undefined, observer: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined,
  frame = 0,
  disposed = false,
  offset = 0,
  renderedId = '';
let inputBlocked = false,
  writing = false,
  queuedBytes = 0;
const queue: { id: string; bytes: Uint8Array }[] = [];
const lifetime = new AbortController();
let initialization: Promise<void> | undefined;
function colors() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: color('--bg', '#202020'),
    foreground: color('--fg', '#e5e5e5'),
    cursor: color('--accent', '#de947b'),
    selectionBackground: color('--accent-soft', '#604c43'),
  };
}
async function initialize() {
  if (initialization) return initialization;
  initialization = (async () => {
    const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
    if (disposed || !host.value) return;
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono'),
      scrollback: 5000,
      theme: colors(),
      allowProposedApi: false,
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.value);
    terminal.onData((text) => enqueue(new TextEncoder().encode(text)));
    terminal.onBinary((text) => enqueue(Uint8Array.from(text, (character) => character.charCodeAt(0))));
    observer = new ResizeObserver(scheduleFit);
    observer.observe(host.value);
    themeObserver = new MutationObserver(() => {
      if (terminal) terminal.options.theme = colors();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    });
    void document.fonts.ready.then(() => {
      if (!disposed) scheduleFit();
    });
    scheduleFit();
  })();
  return initialization;
}
let resizing = false,
  resizeAgain = false;
async function fitTerminal() {
  if (!props.active || !terminal || !fit || !host.value?.clientHeight || !host.value.clientWidth) return;
  fit.fit();
  if (!state.value?.running) return;
  if (resizing) {
    resizeAgain = true;
    return;
  }
  const { id } = state.value;
  const cols = Math.min(500, Math.max(2, terminal.cols)),
    rows = Math.min(300, Math.max(2, terminal.rows));
  if (cols === state.value.cols && rows === state.value.rows) return;
  resizing = true;
  try {
    await resizeTerminal(props.session, id, cols, rows, lifetime.signal);
    if (state.value?.id === id) {
      state.value.cols = cols;
      state.value.rows = rows;
    }
  } catch (cause) {
    if (!disposed) error.value = describeError(cause).message;
  } finally {
    resizing = false;
    if (resizeAgain) {
      resizeAgain = false;
      scheduleFit();
    }
  }
}
function scheduleFit() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => void fitTerminal());
}
function enqueue(bytes: Uint8Array) {
  if (!state.value?.running || inputBlocked || disposed) return;
  if (queuedBytes + bytes.length > 1024 * 1024) {
    error.value = tr('粘贴内容过大，请分段输入。', 'Paste is too large. Send smaller sections.');
    return;
  }
  for (let index = 0; index < bytes.length; index += 8192)
    queue.push({ id: state.value.id, bytes: bytes.slice(index, index + 8192) });
  queuedBytes += bytes.length;
  void flushInput();
}
function clearInput() {
  queue.length = 0;
  queuedBytes = 0;
}
async function flushInput() {
  if (writing || disposed) return;
  writing = true;
  try {
    while (queue.length && state.value?.running && !inputBlocked && !disposed) {
      const { id, bytes } = queue.shift()!;
      queuedBytes -= bytes.length;
      if (state.value.id !== id) continue;
      try {
        await writeTerminal(props.session, id, bytes, lifetime.signal);
      } catch (cause) {
        if (disposed || state.value?.id !== id) continue;
        inputBlocked = true;
        clearInput();
        error.value = describeError(cause).message + tr(' 输入未自动重发。', ' Input was not resent.');
      }
    }
  } finally {
    writing = false;
  }
}
function special(text: string) {
  enqueue(new TextEncoder().encode(text));
  terminal?.focus();
}
async function start() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  clearInput();
  try {
    await initialize();
    fit?.fit();
    const result = await startTerminal(
      props.session,
      Math.min(500, terminal?.cols || 80),
      Math.min(300, terminal?.rows || 24),
      lifetime.signal,
    );
    if (disposed) return;
    state.value = result.terminal;
    inputBlocked = false;
    revision.value++;
    terminal?.focus();
  } catch (cause) {
    if (!disposed) error.value = describeError(cause).message;
  } finally {
    busy.value = false;
  }
}
async function stop() {
  if (!state.value || busy.value) return;
  busy.value = true;
  inputBlocked = true;
  clearInput();
  try {
    await closeTerminal(props.session, state.value.id, lifetime.signal);
    revision.value++;
  } catch (cause) {
    if (!disposed) error.value = describeError(cause).message;
  } finally {
    busy.value = false;
  }
}
function reconnect() {
  error.value = '';
  inputBlocked = false;
  revision.value++;
}
onMounted(() => {
  watch(
    [() => props.active, revision],
    async (_, __, cleanup) => {
      if (!props.active) return;
      const controller = new AbortController();
      cleanup(() => controller.abort());
      try {
        await nextTick();
        await initialize();
        if (controller.signal.aborted) return;
        const result = await terminalState(props.session, controller.signal);
        if (controller.signal.aborted) return;
        state.value = result.terminal;
        loaded.value = true;
        if (!state.value || !terminal) return;
        if (renderedId !== state.value.id) {
          terminal.reset();
          offset = 0;
          renderedId = state.value.id;
        }
        const id = state.value.id;
        scheduleFit();
        while (!controller.signal.aborted) {
          const result = await pollTerminal(props.session, id, offset, controller.signal);
          if (controller.signal.aborted || !terminal) return;
          state.value = result.terminal;
          if (result.reset) {
            terminal.reset();
            notice.value = tr(
              '较早的终端输出已清理，显示保留的最近内容。',
              'Earlier output was cleared. Showing retained output.',
            );
          }
          if (result.data) {
            const bytes = Uint8Array.from(atob(result.data), (character) => character.charCodeAt(0));
            await new Promise<void>((resolve) => terminal!.write(bytes, resolve));
          }
          offset = result.next_offset;
          if (!result.terminal.running && result.eof && !result.data) break;
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          error.value = describeError(cause).message;
          loaded.value = true;
        }
      }
    },
    { immediate: true },
  );
});
onBeforeUnmount(() => {
  disposed = true;
  lifetime.abort();
  cancelAnimationFrame(frame);
  observer?.disconnect();
  themeObserver?.disconnect();
  terminal?.dispose();
});
</script>

<template>
  <section
    class="session-terminal"
    data-keyboard-boundary
    data-terminal-input
    :aria-label="tr('交互终端', 'Interactive terminal')"
  >
    <div class="terminal-toolbar">
      <span class="terminal-status" :class="{ running: state?.running }">
        <span class="terminal-dot" />{{
          state?.running
            ? tr('运行中', 'Running')
            : state
              ? tr('已退出', 'Exited') + ` · ${state.exit_code ?? '—'}`
              : tr('Shell', 'Shell')
        }}
      </span>
      <span v-if="state" class="terminal-cwd" :title="state.cwd">{{ state.cwd }}</span>
      <button v-if="state?.running" class="btn ghost sm" :disabled="busy" @click="stop">
        {{ tr('结束', 'Stop') }}
      </button>
      <button v-else-if="state" class="btn ghost sm" :disabled="busy" @click="start">
        {{ tr('重新启动', 'Restart') }}
      </button>
    </div>
    <div v-if="error" class="terminal-message" role="alert">
      {{ error }} <button class="btn ghost sm" @click="reconnect">{{ tr('重新连接', 'Reconnect') }}</button>
    </div>
    <p v-if="state?.error" class="terminal-message" role="alert">{{ state.error }}</p>
    <p v-if="notice" class="terminal-message">{{ notice }}</p>
    <div class="terminal-stage">
      <div ref="host" class="terminal-host" :class="{ 'terminal-idle': !state }" />
      <div v-if="!state" class="terminal-empty">
        <Icon name="terminal" :size="28" />
        <p>{{ tr('在此会话的工作目录中打开终端', 'Open a terminal in this session’s working directory') }}</p>
        <button class="btn" :disabled="busy || !loaded" @click="start">
          {{ busy ? tr('正在启动…', 'Starting…') : tr('启动终端', 'Start terminal') }}
        </button>
      </div>
    </div>
    <div v-if="mobile && state?.running" class="terminal-keys" :aria-label="tr('终端按键', 'Terminal keys')">
      <button
        v-for="key in [
          { label: 'Esc', data: '\x1b' },
          { label: 'Tab', data: '\t' },
          { label: 'Ctrl+C', data: '\x03' },
          { label: '↑', data: '\x1b[A' },
          { label: '↓', data: '\x1b[B' },
          { label: '←', data: '\x1b[D' },
          { label: '→', data: '\x1b[C' },
        ]"
        :key="key.label"
        class="btn ghost sm"
        @pointerdown.prevent
        @click="special(key.data)"
      >
        {{ key.label }}
      </button>
    </div>
  </section>
</template>
<style scoped>
.session-terminal {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.terminal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  color: var(--fg-muted);
}
.terminal-status {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.terminal-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--fg-muted);
}
.running .terminal-dot {
  background: var(--accent);
}
.terminal-cwd {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.terminal-stage {
  flex: 1;
  min-height: 0;
  position: relative;
}
.terminal-host {
  position: absolute;
  inset: 8px 6px 0;
  overflow: hidden;
}
.terminal-idle {
  visibility: hidden;
}
.terminal-empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  color: var(--fg-muted);
  text-align: center;
  font-size: 12px;
}
.terminal-empty p {
  margin: 0;
}
.terminal-message {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.terminal-keys {
  display: flex;
  justify-content: space-between;
  padding: 4px 6px max(4px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
}
.terminal-keys .btn {
  padding: 0 8px;
  min-height: 32px;
}
.terminal-host :deep(.xterm-viewport) {
  background-color: var(--bg);
}
.terminal-host :deep(.composition-view) {
  background: var(--bg);
  color: var(--fg);
}
.terminal-host :deep(.xterm) {
  height: 100%;
}
</style>
