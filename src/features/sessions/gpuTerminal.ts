// GPU emulators share Wish's existing PTY connection, replay boundary and input queue.
import type { ITheme } from '@xterm/xterm';
import { terminalColorNames } from '../../ui/terminalTheme.ts';
import fontUrl from '../../generated/terminal-font/MapleMono-NF-CN-Regular.ttf?url';

export interface TerminalView {
  readonly cols: number;
  readonly rows: number;
  fit(): void;
  focus(): void;
  reset(): void | Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  configure(size: number, theme: ITheme): void;
  dispose(): void;
}

export async function gpuTerminal(
  engine: 'restty' | 'wraith',
  host: HTMLElement,
  size: number,
  theme: ITheme,
  input: (bytes: Uint8Array) => void,
  resized: () => void,
): Promise<TerminalView> {
  const palette = (t: ITheme) => terminalColorNames.slice(4).map((name) => t[name]!);
  if (engine === 'wraith') {
    if (!('gpu' in navigator))
      throw new Error(window.isSecureContext ? 'WebGPU unavailable' : 'WebGPU requires HTTPS or localhost');
    const { Wraith } = await import('wraithterm');
    const colors = (t: ITheme) => ({
      foreground: t.foreground,
      background: t.background,
      cursor: t.cursor,
      palette: palette(t),
    });
    const term = await Wraith.mount(host, {
      font: fontUrl,
      fontSize: size,
      scrollback: 5000,
      imageStorageLimit: 32 * 1024 * 1024,
      commandBlocks: false,
      theme: colors(theme),
    });
    // Wraith focuses its hidden textarea on pointerdown. Chromium's subsequent
    // native mousedown on the non-focusable canvas would move focus back to body.
    term.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) event.preventDefault();
    });
    host.dataset.backend = 'webgpu';
    term.onBytes(input);
    term.onResize(resized);
    return {
      get cols() {
        return term.cols;
      },
      get rows() {
        return term.rows;
      },
      fit: () => term.fit(),
      focus: () => term.focus(),
      reset: () => term.write('\x1bc'),
      write: (bytes) => term.write(bytes),
      configure(next, t) {
        term.setTheme(colors(t));
        if (next !== size) {
          size = next;
          void term.setFontSize(next);
        }
      },
      dispose: () => {
        void term.dispose();
      },
    };
  }

  const { Restty, parseGhosttyTheme } = await import('restty');
  const colors = (t: ITheme) =>
    parseGhosttyTheme(
      [
        'background = ' + t.background,
        'foreground = ' + t.foreground,
        'cursor-color = ' + t.cursor,
        'selection-background = ' + t.selectionBackground,
        ...palette(t).map((hex, i) => 'palette = ' + i + '=' + hex),
      ].join('\n'),
    );
  const encoder = new TextEncoder();
  let cols = 80,
    rows = 24,
    decoder = new TextDecoder(),
    receive: ((text: string) => void) | undefined;
  let parsing = false;
  const term = new Restty({
    root: host,
    surface: {
      autoInit: false,
      shortcuts: false,
      searchUi: false,
      defaultContextMenu: false,
      createInitialPane: { focus: false },
    },
    terminal: {
      fonts: [{ url: fontUrl, name: 'Maple Mono NF CN' }],
      fontSize: size,
      theme: colors(theme),
      showResizeOverlay: false,
    },
    services: {
      ptyTransport: {
        connect({ callbacks }) {
          receive = callbacks.onData;
          callbacks.onConnect?.();
        },
        isConnected: () => !!receive,
        disconnect() {
          receive = undefined;
        },
        sendInput(text) {
          // restty identifies itself as native Ghostty. Use direct Kitty placements
          // in the browser, including clients which select Unicode placeholders by brand.
          const reply = parsing && text === '\x1bP>|ghostty 1.0\x1b\\' ? '\x1bP>|Wish restty\x1b\\' : text;
          input(encoder.encode(reply));
          return true;
        },
        resize(c, r) {
          if (cols !== c || rows !== r) {
            cols = c;
            rows = r;
            resized();
          }
          return true;
        },
      },
    },
  });
  const runtime = term.getActivePane()!.runtime;
  try {
    await runtime.lifecycle.init();
    if (runtime.render.getBackend() === 'none') throw new Error('WebGPU / WebGL2 unavailable');
    host.dataset.backend = runtime.render.getBackend();
    runtime.io.connectPty();
  } catch (cause) {
    term.destroy();
    throw cause;
  }
  return {
    get cols() {
      return cols;
    },
    get rows() {
      return rows;
    },
    fit: () => runtime.interaction.updateSize(),
    focus: () => runtime.interaction.focus(),
    reset() {
      decoder = new TextDecoder();
      receive?.('\x1bc');
    },
    async write(bytes) {
      parsing = true;
      try {
        receive?.(decoder.decode(bytes, { stream: true }));
      } finally {
        parsing = false;
      }
    },
    configure(next, t) {
      runtime.terminal.applyTheme(colors(t));
      if (next !== size) {
        size = next;
        runtime.terminal.setFontSize(next);
      }
    },
    dispose: () => term.destroy(),
  };
}
