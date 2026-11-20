import { isNativeApp } from '../../platform/native.ts';
import { apiFetch } from '../../core/api/client.ts';
import { shallowReactive, shallowRef } from 'vue';

export const sourcePageBytes = 32 * 1024;

type Page = { start: number; end: number };
export type SourceBlock = { page: Page; from: number; to: number; offset: number; line: number; rows: number };

// Pages end at logical line boundaries when possible. Very long lines continue in
// bounded pieces, retaining their logical number and exact UTF-16 quote coordinates.
export class SourcePages {
  readonly blocks: SourceBlock[] = [];
  readonly count = shallowRef(0);
  readonly cache = shallowReactive(new Map<number, string>());
  private readonly pending = new Map<number, Promise<string>>();
  private advancing?: Promise<void>;
  private nextByte = 0;
  private nextOffset = 0;
  private nextLine = 1;

  constructor(
    private url: string,
    readonly size: number,
    private version: string,
    readonly signal: AbortSignal,
  ) {}

  get complete() {
    return this.nextByte === this.size;
  }
  get length() {
    return this.nextOffset;
  }

  private async bytes(start: number, end: number) {
    const headers = new Headers({ Range: `bytes=${start}-${end - 1}` });
    if (isNativeApp() || new URL(this.url, location.href).origin === location.origin)
      headers.set('If-Range', this.version);
    const response = await apiFetch(this.url, {
      signal: this.signal,
      cache: 'no-cache',
      headers,
    });
    const range = response.headers.get('content-range');
    if (
      (response.status !== 206 && !(response.ok && start === 0 && end === this.size)) ||
      (range && range !== `bytes ${start}-${end - 1}/${this.size}`) ||
      (response.headers.get('etag') && response.headers.get('etag') !== this.version)
    ) {
      await response.body?.cancel();
      throw new Error(`File range unavailable (HTTP ${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== end - start) throw new Error('Incomplete file range');
    return bytes;
  }

  private decode(start: number, bytes: Uint8Array) {
    // Only the initial BOM belongs to the file encoding.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: start !== 0 }).decode(bytes);
  }
  private remember(page: Page, text: string) {
    this.cache.set(page.start, text);
    if (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!);
    return text;
  }

  read(page: Page): Promise<string> {
    const cached = this.cache.get(page.start);
    if (cached !== undefined) return Promise.resolve(cached);
    let request = this.pending.get(page.start);
    if (!request) {
      request = this.bytes(page.start, page.end)
        .then((bytes) => this.remember(page, this.decode(page.start, bytes)))
        .finally(() => this.pending.delete(page.start));
      this.pending.set(page.start, request);
    }
    return request;
  }

  next(): Promise<void> {
    if (this.complete) return Promise.resolve();
    return (this.advancing ??= this.append().finally(() => {
      this.advancing = undefined;
    }));
  }
  private async append() {
    const start = this.nextByte;
    const end = Math.min(this.size, start + sourcePageBytes);
    const bytes = await this.bytes(start, end);
    let cut = bytes.length;
    if (end < this.size) {
      // Leave the last scalar (and any CR before it) for the next request.
      cut--;
      while ((bytes[cut]! & 0xc0) === 0x80) cut--;
      if (bytes[cut - 1] === 13) cut--;
      for (let i = cut - 1; i >= bytes.length / 2; i--) {
        if (bytes[i] === 10 || bytes[i] === 13) {
          cut = i + 1;
          break;
        }
      }
    }
    const page = { start, end: start + cut };
    const text = this.remember(page, this.decode(start, bytes.subarray(0, cut)));
    let from = 0,
      line = this.nextLine,
      breaks = 0;
    const finish = (to: number) => {
      const last = text[to - 1];
      const endsLine = last === '\n' || last === '\r';
      const finalBlank = endsLine && to === text.length && page.end === this.size;
      this.blocks.push({
        page,
        from,
        to,
        offset: this.nextOffset + from,
        line,
        rows: Math.max(1, breaks + Number(!endsLine || finalBlank)),
      });
      line += breaks;
      from = to;
      breaks = 0;
    };
    let lineStart = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      if (c === 13 || c === 10) {
        breaks++;
        lineStart = i + 1;
        if (breaks === 24 || lineStart - from >= 2048) finish(lineStart);
      } else if (i + 1 - from >= 2048 && !(c >= 0xd800 && c <= 0xdbff)) {
        finish(breaks ? lineStart : i + 1);
      }
    }
    if (from < text.length) finish(text.length);
    this.nextLine = line;
    this.nextOffset += text.length;
    this.nextByte = page.end;
    this.count.value = this.blocks.length;
  }
  async all(signal = this.signal) {
    const response = await apiFetch(this.url, { signal, cache: 'no-cache' });
    if (!response.ok || (response.headers.get('etag') && response.headers.get('etag') !== this.version)) {
      await response.body?.cancel();
      throw new Error(`File unavailable (HTTP ${response.status})`);
    }
    return response.text();
  }
}
