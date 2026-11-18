<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { TerminalSettings } from '../../core/configTypes.ts';
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { ApiError } from '../../core/api/client.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { bus } from '../../core/bus.ts';
import { wishTerminalTheme } from '../../ui/terminalTheme.ts';
import { registerTerminalLeave } from './terminalLeave.ts';
import {
  terminalState,
  startTerminal,
  terminalSocket,
  leaveTerminal,
  type TerminalState,
  type TerminalOutput,
} from '../../core/api/terminal.ts';
import '@xterm/xterm/css/xterm.css';
const props = defineProps<{ session: string; active: boolean; mobile: boolean }>();
const host = ref<HTMLElement>();
const state = ref<TerminalState | null>(null);
const settings = ref<TerminalSettings>({
  shell: '',
  persistence: 'none',
  per_session: false,
  session_name: '',
  font_size: 13,
  colors: {},
});
const error = ref(''),
  notice = ref(''),
  connected = ref(false),
  latency = ref<number | null>(null);
const confirmClose = ref(false);
const unreachable = ref(false);
const pageActive = usePageActivity();
let inFlightBytes = 0;
let answerClose: ((yes: boolean) => void) | undefined;
function answer(yes: boolean) {
  confirmClose.value = false;
  answerClose?.(yes);
  answerClose = undefined;
}
let terminal: Terminal | undefined, fit: FitAddon | undefined, observer: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined,
  frame = 0,
  disposed = false,
  offset = 0,
  renderedId = '';
let inputBlocked = false;
const lifetime = new AbortController();
let initialization: Promise<void> | undefined;
async function initialize() {
  if (initialization) return initialization;
  initialization = (async () => {
    const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
    if (disposed || !host.value) return;
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: settings.value.font_size,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono'),
      scrollback: 5000,
      theme: wishTerminalTheme(settings.value.colors),
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
      if (terminal) terminal.options.theme = wishTerminalTheme(settings.value.colors);
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
async function fitTerminal() {
  if (!props.active || !terminal || !fit || !host.value?.clientHeight || !host.value.clientWidth) return;
  fit.fit();
  if (!state.value?.running) return;
  const cols = Math.min(500, Math.max(2, terminal.cols)),
    rows = Math.min(300, Math.max(2, terminal.rows));
  if (cols === state.value.cols && rows === state.value.rows) return;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'resize', cols, rows }));
    state.value.cols = cols;
    state.value.rows = rows;
  }
}
function scheduleFit() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => void fitTerminal());
}

let socket: WebSocket | undefined, connection: AbortController | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined, retryTimer: ReturnType<typeof setTimeout> | undefined;
let inputTimer: ReturnType<typeof setTimeout> | undefined;
const queue: Uint8Array[] = [];
let queuedBytes = 0,
  generation = 0,
  leaving = false,
  reconnects = 0;
let starting: Promise<void> | undefined, pendingLeave: Promise<boolean> | undefined;
const exits: number[] = [];
function clearInput() {
  queue.length = 0;
  queuedBytes = 0;
  inFlightBytes = 0;
  clearTimeout(inputTimer);
}
function enqueue(bytes: Uint8Array) {
  if (!connected.value || !state.value?.running || inputBlocked || disposed || leaving) return;
  if (queuedBytes + inFlightBytes + bytes.length > 1024 * 1024) {
    error.value = tr('粘贴内容过大，请分段输入。', 'Paste is too large. Send smaller sections.');
    return;
  }
  for (let index = 0; index < bytes.length; index += 8192) queue.push(bytes.slice(index, index + 8192));
  queuedBytes += bytes.length;
  flushInput();
}
function flushInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    clearInput();
    return;
  }
  while (queue.length && socket.bufferedAmount < 65536 && inFlightBytes < 32768) {
    const bytes = queue.shift()!;
    queuedBytes -= bytes.length;
    inFlightBytes += bytes.length;
    socket.send(bytes);
  }
  if (queue.length && inFlightBytes < 32768) inputTimer = setTimeout(flushInput, 8);
}
function special(text: string) {
  enqueue(new TextEncoder().encode(text));
  terminal?.focus();
}
function disconnect() {
  generation++;
  connection?.abort();
  connection = undefined;
  clearTimeout(retryTimer);
  clearInterval(heartbeat);
  clearInput();
  const old = socket;
  socket = undefined;
  old?.close();
  connected.value = false;
}
function applySettings(value?: TerminalSettings) {
  if (!value) return;
  settings.value = value;
  if (terminal) {
    terminal.options.fontSize = value.font_size;
    terminal.options.theme = wishTerminalTheme(value.colors);
    scheduleFit();
  }
}
async function connect() {
  if (!props.active || disposed || leaving) return;
  disconnect();
  const own = generation;
  const controller = new AbortController();
  connection = controller;
  try {
    await nextTick();
    await initialize();
    if (controller.signal.aborted || !terminal) return;
    const current = await terminalState(props.session, controller.signal);
    applySettings(current.settings);
    state.value = current.terminal;
    if (controller.signal.aborted) return;
    if (!state.value?.running) {
      fit?.fit();
      // Keep start completion observable by the leave guard even if navigation begins mid-request.
      const created = await startTerminal(
        props.session,
        Math.min(500, Math.max(2, terminal.cols || 80)),
        Math.min(300, Math.max(2, terminal.rows || 24)),
      );
      state.value = created.terminal;
      applySettings(created.settings);
      if (controller.signal.aborted || disposed) {
        await leaveTerminal(props.session, created.terminal.id, true);
        return;
      }
    }
    if (renderedId !== state.value.id) {
      terminal.reset();
      offset = 0;
      renderedId = state.value.id;
      clearInput();
    }
    const ws = await terminalSocket(props.session, state.value.id, offset, controller.signal);
    if (controller.signal.aborted) {
      ws.close();
      return;
    }
    socket = ws;
    let rendered = Promise.resolve();
    let eof = false;
    const failed = (cause: unknown) => {
      if (own === generation) {
        error.value = describeError(cause).message;
        ws.close();
      }
    };
    ws.onopen = () => {
      if (own !== generation) {
        ws.close();
        return;
      }
      connected.value = true;
      inputBlocked = false;
      reconnects = 0;
      error.value = '';
      scheduleFit();
      terminal?.focus();
      const ping = () => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', time: performance.now() }));
      };
      ping();
      heartbeat = setInterval(ping, 3000);
    };
    ws.onmessage = (event) => {
      rendered = rendered
        .then(async () => {
          if (own !== generation || !terminal) return;
          const message = JSON.parse(event.data);
          if (message.type === 'input_ack') {
            inFlightBytes = Math.max(0, inFlightBytes - message.bytes);
            flushInput();
            return;
          }
          if (message.type === 'pong') {
            latency.value = Math.round(performance.now() - message.time);
            return;
          }
          if (message.type === 'error') throw new Error(message.message);
          if (message.type !== 'output') return;
          const output: TerminalOutput = message.output;
          state.value = output.terminal;
          if (output.reset) {
            terminal.reset();
            notice.value = tr('较早输出已清理，显示最近内容。', 'Earlier output was cleared. Showing recent output.');
          }
          if (output.data) {
            const bytes = Uint8Array.from(atob(output.data), (c) => c.charCodeAt(0));
            await new Promise<void>((resolve) => terminal!.write(bytes, resolve));
          }
          if (own !== generation) return;
          offset = output.next_offset;
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ack', offset }));
          eof = !output.terminal.running && output.eof;
        })
        .catch(failed);
    };
    ws.onerror = () => {
      if (own === generation)
        error.value = tr(
          '终端连接中断，正在重连。输入不会重发。',
          'Terminal disconnected. Reconnecting; input will not be resent.',
        );
    };
    ws.onclose = () => {
      void rendered.finally(() => {
        if (own !== generation || disposed) return;
        connected.value = false;
        clearInterval(heartbeat);
        clearInput();
        if (!props.active || leaving) return;
        if (eof && state.value?.persistent) {
          error.value = tr(
            '已与持久化终端断开。可重新连接；若连接失败，请检查已有会话设置。',
            'Detached from the persistent terminal. Reconnect when ready; if attachment failed, check the existing session settings.',
          );
          return;
        }
        if (eof) {
          exits.push(Date.now());
          while (exits.length && Date.now() - exits[0]! > 10000) exits.shift();
          if (exits.length >= 3) {
            error.value = tr(
              'Shell 连续退出，请检查终端配置后重试。',
              'Shell exited repeatedly. Check terminal settings and retry.',
            );
            return;
          }
        }
        retryTimer = setTimeout(reconnect, eof ? 150 : Math.min(5000, 300 * 2 ** reconnects++));
      });
    };
  } catch (cause) {
    if (!controller.signal.aborted && !disposed) error.value = describeError(cause).message;
  }
}
function reconnect() {
  if (starting) return;
  error.value = '';
  starting = connect().finally(() => {
    starting = undefined;
  });
}
async function leave() {
  if (pendingLeave) return pendingLeave;
  pendingLeave = (async () => {
    leaving = true;
    try {
      await starting;
      if (state.value?.running) {
        const id = state.value.id;
        let result = await leaveTerminal(props.session, id);
        if (result.confirmation_required) {
          unreachable.value = false;
          confirmClose.value = true;
          if (
            !(await new Promise<boolean>((resolve) => {
              answerClose = resolve;
            }))
          )
            return false;
          result = await leaveTerminal(props.session, id, true);
        }
        state.value = result.terminal;
      }
      disconnect();
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        state.value = null;
        disconnect();
        return true;
      }
      error.value = describeError(cause).message;
      unreachable.value = true;
      confirmClose.value = true;
      const allowed = await new Promise<boolean>((resolve) => {
        answerClose = resolve;
      });
      if (allowed) disconnect();
      return allowed;
    } finally {
      leaving = false;
      // The shell or network can close while the confirmation is open. Cancelling
      // must resume the connection rather than leave an apparently connected pane.
      if (!disposed && props.active && socket?.readyState === WebSocket.CLOSED) retryTimer = setTimeout(reconnect, 150);
    }
  })().finally(() => {
    pendingLeave = undefined;
  });
  return pendingLeave;
}
const unregister = registerTerminalLeave(props.session, leave);
const offConfig = bus.on('configuration.changed', () => {
  void terminalState(props.session, lifetime.signal)
    .then((value) => applySettings(value.settings))
    .catch(() => {});
});
function beforeUnload(event: BeforeUnloadEvent) {
  if (state.value?.running && !state.value.persistent) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  watch(pageActive, (visible) => {
    if (visible && props.active && !connected.value && !starting) reconnect();
  });
  watch(
    () => props.active,
    (active) => {
      if (active) reconnect();
      else disconnect();
    },
    { immediate: true },
  );
});
onBeforeUnmount(() => {
  disposed = true;
  answer(false);
  unregister();
  offConfig();
  disconnect();
  lifetime.abort();
  window.removeEventListener('beforeunload', beforeUnload);
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
    <div class="terminal-connection" role="status">
      <span :class="{ connected }" />{{
        connected
          ? state?.persistent
            ? tr('已连接 · 持久化', 'Connected · Persistent')
            : tr('已连接', 'Connected')
          : tr('正在连接…', 'Connecting…')
      }}<small v-if="connected && latency !== null">{{ latency }} ms</small
      ><code v-if="state" :title="state.cwd">{{ state.cwd }}</code>
    </div>
    <div v-if="error" class="terminal-message" role="alert">
      {{ error }} <button class="btn ghost sm" @click="reconnect">{{ tr('重试', 'Retry') }}</button>
    </div>
    <p v-if="notice" class="terminal-message">{{ notice }}</p>
    <div class="terminal-stage" data-sheet-drag-ignore><div ref="host" class="terminal-host" /></div>
    <div v-if="mobile && state?.running" class="terminal-keys" :aria-label="tr('终端按键', 'Terminal keys')">
      <button
        v-for="key in [
          { label: 'Esc', data: '\x1b' },
          { label: 'Tab', data: '\t' },
          { label: 'Ctrl+C', data: '\x03' },
          { label: 'Ctrl+D', data: '\x04' },
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
    <Modal
      :open="confirmClose"
      :title="tr('关闭正在运行的终端？', 'Close the running terminal?')"
      @close="answer(false)"
      ><p>
        {{
          unreachable
            ? tr(
                '无法确认终端状态。仍要离开吗？未启用持久化的任务可能在断线宽限期后结束。',
                'Cannot confirm terminal state. Leave anyway? Nonpersistent jobs may end after the reconnect grace period.',
              )
            : tr(
                '终端中仍有任务运行。离开会结束 Shell 和这些任务。',
                'Jobs are still running in this terminal. Leaving ends the shell and these jobs.',
              )
        }}
      </p>
      <template #footer
        ><button class="btn ghost" @click="answer(false)">{{ tr('留在终端', 'Stay') }}</button
        ><button class="btn danger" @click="answer(true)">
          {{ unreachable ? tr('仍要离开', 'Leave anyway') : tr('结束并离开', 'End and leave') }}
        </button></template
      ></Modal
    >
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
.terminal-connection {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  color: var(--fg-muted);
  font-size: 10px;
  flex: none;
}
.terminal-connection > span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--fg-subtle);
}
.terminal-connection > span.connected {
  background: var(--accent);
}
.terminal-connection code {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 55%;
  font-size: 10px;
}
.terminal-stage {
  flex: 1;
  min-height: 0;
  position: relative;
}
.terminal-host {
  position: absolute;
  inset: 2px 6px 0;
  overflow: hidden;
}
.terminal-message {
  margin: 0;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.terminal-keys {
  display: flex;
  justify-content: space-between;
  padding: 4px 4px max(4px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
}
.terminal-keys .btn {
  padding: 0 5px;
  min-height: 32px;
  font-size: 11px;
}
.terminal-host :deep(.xterm-viewport) {
  background-color: transparent;
}
.terminal-host :deep(.composition-view) {
  background: var(--bg);
  color: var(--fg);
}
.terminal-host :deep(.xterm) {
  height: 100%;
}
</style>
