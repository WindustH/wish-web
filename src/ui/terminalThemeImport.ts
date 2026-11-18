import { terminalColorNames } from './terminalTheme.ts';

const known = new Set<string>(terminalColorNames);
export const terminalThemeSizeLimit = 256 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function hex(value: unknown): string {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim())) throw new Error('theme_color');
  const color = value.trim().toLowerCase();
  return color.length === 4 ? '#' + [...color.slice(1)].map((c) => c + c).join('') : color;
}
export function parseTerminalTheme(source: string): Record<string, string> {
  if (source.length > terminalThemeSizeLimit) throw new Error('theme_size');
  const text = source.replace(/^\uFEFF/, '').trim();
  const result: Record<string, string> = {};
  if (text.startsWith('<')) {
    // Accept the standard Apple plist declaration without fetching an external DTD.
    // Internal entity declarations and ambiguous dictionaries are not theme data.
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw new Error('theme_format');
    const document = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml');
    if (document.querySelector('parsererror') || document.documentElement.tagName !== 'plist')
      throw new Error('theme_format');
    const dictionary = document.documentElement.children[0];
    if (!dictionary || dictionary.tagName !== 'dict') throw new Error('theme_format');
    const pairs = (element: Element) => {
      const entries = new Map<string, Element>();
      const children = [...element.children];
      if (children.length % 2) throw new Error('theme_format');
      for (let index = 0; index < children.length; index += 2) {
        const key = children[index]!,
          value = children[index + 1]!;
        if (key.tagName !== 'key' || entries.has(key.textContent ?? '')) throw new Error('theme_format');
        entries.set(key.textContent ?? '', value);
      }
      return entries;
    };
    const names: Record<string, string> = {
      'Background Color': 'background',
      'Foreground Color': 'foreground',
      'Cursor Color': 'cursor',
      'Selection Color': 'selectionBackground',
    };
    for (const [key, value] of pairs(dictionary)) {
      const ansi = /^Ansi (\d|1[0-5]) Color$/.exec(key);
      const name = ansi ? terminalColorNames[4 + Number(ansi[1])] : names[key];
      if (!name) continue;
      if (value.tagName !== 'dict') throw new Error('theme_color');
      const channels = pairs(value);
      const rgb = ['Red Component', 'Green Component', 'Blue Component'].map((channel) => {
        const element = channels.get(channel);
        const text = element?.textContent?.trim();
        const number = text ? Number(text) : NaN;
        if (
          !element ||
          !['real', 'integer'].includes(element.tagName) ||
          !Number.isFinite(number) ||
          number < 0 ||
          number > 1
        )
          throw new Error('theme_color');
        return Math.round(number * 255)
          .toString(16)
          .padStart(2, '0');
      });
      result[name] = '#' + rgb.join('');
    }
  } else {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('theme_format');
    }
    if (!record(data)) throw new Error('theme_format');
    if (record(data.terminal)) data = data.terminal;
    if (record(data) && record(data.theme)) data = data.theme;
    if (record(data) && record(data.colors)) data = data.colors;
    if (!record(data)) throw new Error('theme_format');
    for (const [key, value] of Object.entries(data)) {
      const name = key === 'cursorColor' ? 'cursor' : key;
      if (known.has(name)) result[name] = hex(value);
    }
  }
  if (!Object.keys(result).length) throw new Error('theme_empty');
  return result;
}
