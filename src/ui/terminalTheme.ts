import type { ITheme } from '@xterm/xterm';
export const terminalColorNames = [
  'background',
  'foreground',
  'cursor',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;
export function wishTerminalTheme(overrides: Record<string, string> = {}): ITheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const bg = token('--bg', '#202020');
  const dark = !/^#(?:f|e|d|c)/i.test(bg);
  return {
    background: bg,
    foreground: token('--fg', '#e5e0da'),
    cursor: token('--accent', '#de947b'),
    cursorAccent: overrides.background || bg,
    selectionBackground: dark ? '#59483f' : '#e7cdc0',
    black: '#34312f',
    red: dark ? '#db8982' : '#a94b42',
    green: dark ? '#a5b992' : '#526e3f',
    yellow: dark ? '#d9bd88' : '#8b6829',
    blue: dark ? '#94afc4' : '#426b8b',
    magenta: dark ? '#baa0bc' : '#825785',
    cyan: dark ? '#8dbbb4' : '#397871',
    white: dark ? '#d4ccc3' : '#57504a',
    brightBlack: dark ? '#857d74' : '#756b61',
    brightRed: dark ? '#edaaa0' : '#a24640',
    brightGreen: dark ? '#bfd0ac' : '#486535',
    brightYellow: dark ? '#ecd2a0' : '#805d22',
    brightBlue: dark ? '#b0c8dd' : '#3d6285',
    brightMagenta: dark ? '#d3bad5' : '#7d4d80',
    brightCyan: dark ? '#abd5cd' : '#316f68',
    brightWhite: dark ? '#f2ebe3' : '#292622',
    ...overrides,
  };
}
