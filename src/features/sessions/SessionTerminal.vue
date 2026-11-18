<script setup lang="ts">
import { useMedia } from '../../ui/composables/useMedia.ts';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { TerminalSettings } from '../../core/configTypes.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { bus } from '../../core/bus.ts';
import { wishTerminalTheme } from '../../ui/terminalTheme.ts';
import { rememberTerminal, claimTerminal, parkTerminal, terminalFrontendOpen } from './terminalLifetime.ts';
import {
  terminalState,
  startTerminal,
  terminalSocket,
  type TerminalState,
  type TerminalOutput,
} from '../../core/api/terminal.ts';
import '@xterm/xterm/css/xterm.css';
const coarsePointer = useMedia('(pointer: coarse)');
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
  connected = ref(false);
const pageActive = usePageActivity();
let inFlightBytes = 0;
let terminal: Terminal | undefined, fit: FitAddon | undefined, observer: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined,
  frame = 0,
  disposed = false,
  offset = 0,
  renderedId = '';
let inputBlocked = false;
const lifetime = new AbortController();
let initialization: Promise<void> | undefined;
let fontMetricsDirty = false;
let renderIdle = Promise.resolve();
async function initialize() {
  if (initialization) return initialization;
  initialization = (async () => {
    const [{ Terminal }, { FitAddon }, { ImageAddon }, { Unicode11Addon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-image'),
      import('@xterm/addon-unicode11'),
    ]);
    if (disposed || !host.value) return;
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: settings.value.font_size,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono'),
      scrollback: 5000,
      theme: wishTerminalTheme(settings.value.colors),
      allowProposedApi: true,
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';
    terminal.open(host.value);
    terminal.loadAddon(
      new ImageAddon({
        sixelSupport: true,
        iipSupport: true,
        storageLimit: 32,
        pixelLimit: 8 * 1024 * 1024,
        sixelSizeLimit: 32 * 1024 * 1024,
        iipSizeLimit: 32 * 1024 * 1024,
      }),
    );
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
    document.fonts.addEventListener('loadingdone', refreshFontMetrics);
    void document.fonts.ready.then(() => refreshFontMetrics());
    scheduleFit();
  })();
  return initialization;
}
function refreshFontMetrics(event?: Event) {
  if (disposed || !terminal) return;
  const fonts = (event as FontFaceSetLoadEvent | undefined)?.fontfaces;
  if (
    fonts?.length &&
    !fonts.some((font) =>
      terminal!.options.fontFamily!.toLowerCase().includes(font.family.replace(/["']/g, '').toLowerCase()),
    )
  )
    return;
  fontMetricsDirty = true;
  scheduleFit();
}
function applyFontMetrics() {
  if (!fontMetricsDirty || !terminal) return;
  fontMetricsDirty = false;
  // Maple's CJK subsets load on demand. xterm 6's DOM renderer retains fallback
  // glyph widths even after refresh()/fit(). Reapply the equivalent font stack
  // through its public options API to invalidate that cache, including when the
  // Latin cell width is unchanged. Whitespace changes no font selection.
  const family = terminal.options.fontFamily!.trim();
  terminal.options.fontFamily = terminal.options.fontFamily === family ? `${family} ` : family;
  terminal.refresh(0, terminal.rows - 1);
}
async function fitTerminal() {
  if (!props.active || !terminal || !fit || !host.value?.clientHeight || !host.value.clientWidth) return;
  applyFontMetrics();
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
  reconnects = 0;
let starting: Promise<void> | undefined;
let reconnectPending = false;
let receivedOffset = 0;
const exits: number[] = [];
function clearInput() {
  queue.length = 0;
  queuedBytes = 0;
  inFlightBytes = 0;
  clearTimeout(inputTimer);
}
function enqueue(bytes: Uint8Array) {
  if (!connected.value || !state.value?.running || inputBlocked || disposed) return;
  if (queuedBytes + inFlightBytes + bytes.length > 1024 * 1024) {
    error.value = tr('粘贴内容过大，请分段输入。', 'Paste is too large. Send smaller sections.');
    return;
  }
  error.value = '';
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
function disconnect(park = false) {
  generation++;
  connection?.abort();
  connection = undefined;
  clearTimeout(retryTimer);
  clearInterval(heartbeat);
  clearInput();
  const old = socket;
  socket = undefined;
  if (park && state.value?.running) parkTerminal(props.session, state.value, old, Math.max(offset, receivedOffset));
  else old?.close();
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
  if (!props.active || !pageActive.value || disposed || !terminalFrontendOpen()) return;
  disconnect();
  const own = generation;
  const controller = new AbortController();
  connection = controller;
  try {
    await nextTick();
    await initialize();
    // A write already handed to xterm can finish after the view parks. Wait for
    // its cursor update before asking the server to replay from that cursor.
    await renderIdle;
    if (controller.signal.aborted || !terminal) return;
    const current = await terminalState(props.session, controller.signal);
    applySettings(current.settings);
    state.value = current.terminal;
    if (controller.signal.aborted) return;
    if (!state.value?.running) {
      fit?.fit();
      // Observe a completed start even after navigation so document ownership can retain or release it.
      const created = await startTerminal(
        props.session,
        Math.min(500, Math.max(2, terminal.cols || 80)),
        Math.min(300, Math.max(2, terminal.rows || 24)),
      );
      state.value = created.terminal;
      rememberTerminal(props.session, created.terminal);
      applySettings(created.settings);
      if (controller.signal.aborted || disposed) {
        parkTerminal(props.session, created.terminal, undefined, 0);
        return;
      }
    }
    rememberTerminal(props.session, state.value);
    if (renderedId !== state.value.id) {
      terminal.reset();
      offset = 0;
      renderedId = state.value.id;
      clearInput();
    }
    const { socket: ws, replayUntil } = await terminalSocket(props.session, state.value.id, offset, controller.signal);
    if (controller.signal.aborted) {
      ws.close();
      return;
    }
    socket = ws;
    receivedOffset = offset;
    let rendered = Promise.resolve();
    let eof = false;
    const failed = (cause: unknown) => {
      if (own === generation) {
        error.value = describeError(cause).message;
        ws.close();
      }
    };
    let lastPong = performance.now();
    ws.onopen = () => {
      if (own !== generation) {
        ws.close();
        return;
      }
      claimTerminal(props.session, state.value!.id, ws);
      connected.value = true;
      inputBlocked = offset < replayUntil;
      terminal!.options.disableStdin = inputBlocked;
      reconnects = 0;
      error.value = '';
      scheduleFit();
      const ping = () => {
        if (performance.now() - lastPong > 45000) {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', time: performance.now() }));
      };
      ping();
      heartbeat = setInterval(ping, 15000);
    };
    ws.onmessage = (event) => {
      let message: { type: string; output: TerminalOutput; bytes: number; message: string };
      try {
        message = JSON.parse(event.data);
        if (message.type === 'pong') {
          lastPong = performance.now();
          return;
        }
        if (message.type === 'output') receivedOffset = message.output.next_offset;
      } catch (cause) {
        failed(cause);
        return;
      }
      rendered = rendered
        .then(async () => {
          if (own !== generation || !terminal) return;
          if (message.type === 'input_ack') {
            inFlightBytes = Math.max(0, inFlightBytes - message.bytes);
            flushInput();
            return;
          }
          if (message.type === 'pong') {
            return;
          }
          if (message.type === 'error') throw new Error(message.message);
          if (message.type !== 'output') return;
          const output: TerminalOutput = message.output;
          state.value = output.terminal;
          if (state.value.running || (output.eof && !output.data)) rememberTerminal(props.session, state.value);
          if (output.reset) {
            terminal.reset();
          }
          if (output.data) {
            const bytes = Uint8Array.from(atob(output.data), (c) => c.charCodeAt(0));
            // Parser-generated replies from old DA/DSR/OSC queries must never
            // reach today's foreground program. Split exactly at the server's
            // attachment cursor, even when a frame spans replay and live output.
            const replayBytes = Math.max(0, Math.min(bytes.length, replayUntil - (output.next_offset - bytes.length)));
            if (replayBytes) {
              inputBlocked = true;
              terminal.options.disableStdin = true;
              await new Promise<void>((resolve) => terminal!.write(bytes.subarray(0, replayBytes), resolve));
              offset = Math.max(offset, output.next_offset - bytes.length + replayBytes);
            }
            if (own !== generation) return;
            if (replayBytes < bytes.length) {
              inputBlocked = false;
              terminal.options.disableStdin = false;
              await new Promise<void>((resolve) => terminal!.write(bytes.subarray(replayBytes), resolve));
              offset = Math.max(offset, output.next_offset);
            }
          }
          if (own !== generation) return;
          offset = output.next_offset;
          if (offset >= replayUntil && inputBlocked) {
            inputBlocked = false;
            terminal.options.disableStdin = false;
          }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ack', offset }));
          eof = !output.terminal.running && output.eof;
        })
        .catch(failed);
      renderIdle = rendered;
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
        if (!props.active || !terminalFrontendOpen()) return;
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
  if (starting) {
    reconnectPending = true;
    return;
  }
  reconnectPending = false;
  error.value = '';
  starting = connect().finally(() => {
    starting = undefined;
    if (reconnectPending) {
      reconnectPending = false;
      if (!disposed && props.active && pageActive.value && terminalFrontendOpen()) reconnect();
    }
  });
}
const offConfig = bus.on('configuration.changed', () => {
  void terminalState(props.session, lifetime.signal)
    .then((value) => applySettings(value.settings))
    .catch(() => {});
});
function restored(event: PageTransitionEvent) {
  if (event.persisted && props.active) reconnect();
}
onMounted(() => {
  window.addEventListener('pageshow', restored);
  watch(pageActive, (visible) => {
    if (visible && props.active && !connected.value) reconnect();
    else if (!visible) disconnect(true);
  });
  watch(
    () => props.active,
    (active) => {
      if (active) reconnect();
      else disconnect(true);
    },
    { immediate: true },
  );
});
onBeforeUnmount(() => {
  disposed = true;
  offConfig();
  disconnect(true);
  lifetime.abort();
  window.removeEventListener('pageshow', restored);
  document.fonts.removeEventListener('loadingdone', refreshFontMetrics);
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
    <div v-if="error" class="terminal-message" role="alert">
      {{ error }} <button class="btn ghost sm" @click="reconnect">{{ tr('重试', 'Retry') }}</button>
    </div>
    <div class="terminal-stage" data-sheet-drag-ignore><div ref="host" class="terminal-host" /></div>
    <div
      v-if="(mobile || coarsePointer) && state?.running"
      class="terminal-keys"
      :aria-label="tr('终端按键', 'Terminal keys')"
    >
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
  </section>
</template>
<style scoped>
.session-terminal {
  /* Prose spacing must not add width between xterm's measured cells. */
  text-autospace: no-autospace;
  letter-spacing: 0;
  font-variant-ligatures: none;
  font-kerning: none;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
