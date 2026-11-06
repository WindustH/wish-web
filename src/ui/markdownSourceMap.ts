import type { MarkdownIt, StateBlock, StateInline, StateCore, Token } from 'markdown-it';

/** A run maps an emitted text interval to a parser-consumed source interval.
 * Ordinary text is linear; an escape/entity/formula is an indivisible source atom.
 * Runs, not per-character objects, keep mapping storage proportional to syntax.
 */
export interface SourceRun {
  length: number;
  start: number;
  end: number;
  atomic?: boolean;
}
export interface SourceMapping {
  start: number;
  end: number;
  runs?: SourceRun[];
  atomic?: boolean;
}
interface Location {
  runs?: SourceRun[];
  start: number;
  end: number;
}
interface InlineCacheEntry {
  content: string;
  signature: string;
  children: Token[];
}
export interface SourceCache {
  previous: Map<number, InlineCacheEntry>;
  next: Map<number, InlineCacheEntry>;
}
const reused = new WeakSet<Token>();
const cacheKeys = new WeakMap<Token, { key: number; signature: string }>();

const locations = new WeakMap<Token, Location>();
export const sourceLocation = (token: Token) => locations.get(token);
const runOffsets = new WeakMap<SourceRun[], number[]>();
export function sliceRuns(runs: SourceRun[], from: number, to: number): SourceRun[] {
  const result: SourceRun[] = [];
  let offsets = runOffsets.get(runs);
  if (!offsets) {
    offsets = [0];
    for (const run of runs) offsets.push(offsets.at(-1)! + run.length);
    runOffsets.set(runs, offsets);
  }
  let lo = 0,
    hi = runs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid + 1]! <= from) lo = mid + 1;
    else hi = mid;
  }
  let offset = offsets[lo]!;
  for (let index = lo; index < runs.length; index++) {
    const run = runs[index]!;
    const a = Math.max(from, offset),
      b = Math.min(to, offset + run.length);
    if (a < b)
      result.push({
        length: b - a,
        start: run.atomic ? run.start : run.start + a - offset,
        end: run.atomic ? run.end : run.start + b - offset,
        atomic: run.atomic,
      });
    offset += run.length;
    if (offset >= to) break;
  }
  return result;
}
function setRuns(token: Token, runs: SourceRun[]) {
  if (runs.length) locations.set(token, { runs, start: runs[0]!.start, end: runs.at(-1)!.end });
}
function merge(a: Token, b: Token) {
  if (!a.content) return;
  if (!b.content) {
    const location = locations.get(a);
    if (location) locations.set(b, location);
    b.content = a.content;
    return;
  }
  const x = locations.get(a),
    y = locations.get(b);
  if (x?.runs && y?.runs) {
    runOffsets.delete(x.runs);
    for (const run of y.runs) {
      const last = x.runs.at(-1);
      if (last && !last.atomic && !run.atomic && last.end === run.start) {
        last.length += run.length;
        last.end = run.end;
      } else x.runs.push({ ...run });
    }
    setRuns(b, x.runs);
  } else if (a.content) locations.delete(b);
  b.content = a.content + b.content;
}
function trimRuns(text: string, runs: SourceRun[]) {
  return sliceRuns(runs, text.length - text.trimStart().length, text.trimEnd().length);
}
function literal(start: number, length: number): SourceRun[] {
  return length ? [{ length, start, end: start + length }] : [];
}
function atom(start: number, end: number, length: number): SourceRun[] {
  return length ? [{ length, start, end, atomic: true }] : [];
}

function mapRules<T>(read: (chain: string) => T[], transform: (rule: T) => T): (chain: string) => T[] {
  const cache = new WeakMap<T[], T[]>();
  return (chain) => {
    const rules = read(chain);
    let result = cache.get(rules);
    if (!result) {
      result = rules.map(transform);
      cache.set(rules, result);
    }
    return result;
  };
}

/** Capture positions at the parser's consumption points. No rendered/source text
 * search or alignment is used. Installed after syntax plugins, before parsing.
 */
// markdown-it 15: State constructors, ruler.getRules and fragments_join must retain
// their parser consumption semantics. Re-run source-map fixtures before upgrading.
const installed = new WeakSet<MarkdownIt>();
export function markdownSourceMap(md: MarkdownIt) {
  if (installed.has(md)) return;
  installed.add(md);
  const blockLines = new WeakMap<StateBlock, { text: string; runs: SourceRun[] }>();
  const blockStarts = new WeakMap<StateBlock, number[]>();
  const Block = md.block.State;
  md.block.State = class extends Block {
    constructor(...args: ConstructorParameters<typeof Block>) {
      super(...args);
      blockStarts.set(this, [...this.bMarks]);
    }
    getLines(begin: number, end: number, indent: number, keepLF: boolean) {
      // Same indentation accounting as markdown-it's getLines. The original
      // routine still owns the output; this only records the consumed slices.
      const text = super.getLines(begin, end, indent, keepLF),
        runs: SourceRun[] = [];
      for (let line = begin; line < end; line++) {
        const firstLine = this.bMarks[line]!;
        let first = firstLine,
          columns = 0;
        const last = Math.min(this.src.length, this.eMarks[line]! + (line + 1 < end || keepLF ? 1 : 0));
        while (first < last && columns < indent) {
          const ch = this.src.charCodeAt(first);
          if (ch === 9) columns += 4 - ((columns + this.bsCount[line]!) % 4);
          else if (ch === 32 || first - firstLine < this.tShift[line]!) columns++;
          else break;
          first++;
        }
        if (columns > indent) runs.push(...atom(first - 1, first, columns - indent));
        runs.push(...literal(first, last - first));
      }
      blockLines.set(this, { text, runs });
      return text;
    }
  };
  const blockRules = md.block.ruler.getRules.bind(md.block.ruler);
  const wrappedBlocks = new WeakMap<Function, ReturnType<typeof blockRules>[number]>();
  md.block.ruler.getRules = mapRules(blockRules, (rule) => {
    let wrapped = wrappedBlocks.get(rule);
    if (!wrapped) {
      wrapped = (state, line, end, silent) => {
        const before = state.tokens.length;
        const headingStart = state.bMarks[line]! + state.tShift[line]!;
        const ok = rule(state, line, end, silent);
        if (!ok || silent) return ok;
        const starts = blockStarts.get(state)!;
        const lines = blockLines.get(state);
        let cells: SourceRun[][] = [],
          cell = 0;
        for (let i = before; i < state.tokens.length; i++) {
          const token = state.tokens[i]!;
          if (token.type === 'tr_open' && token.map) {
            cells = tableCells(state, token.map[0]);
            cell = 0;
          }
          if (locations.has(token)) continue;
          if (token.type === 'inline' && !token.map && cells.length) {
            setRuns(token, cells[cell++] ?? []);
            continue;
          }
          if (token.type === 'inline' && token.map) {
            if (state.tokens[i - 1]?.type === 'heading_open' && state.tokens[i - 1]!.markup.startsWith('#')) {
              let start = headingStart;
              while (state.src[start] === '#') start++;
              while (state.src[start] === ' ' || state.src[start] === '\t') start++;
              setRuns(token, literal(start, token.content.length));
            } else if (lines) setRuns(token, trimRuns(lines.text, lines.runs));
          } else if ((token.type === 'fence' || token.type === 'code_block') && lines) {
            setRuns(token, lines.runs);
            const location = locations.get(token);
            if (location && token.map) {
              location.start = starts[token.map[0]]!;
              location.end = state.eMarks[token.map[1] - 1]!;
            }
          } else if (token.map)
            locations.set(token, {
              start: starts[token.map[0]]!,
              end: Math.min(state.src.length, state.eMarks[token.map[1] - 1]!),
            });
        }
        return ok;
      };
      wrappedBlocks.set(rule, wrapped);
    }
    return wrapped;
  });

  const pending = new WeakMap<StateInline, number>();
  const Inline = md.inline.State;
  md.inline.State = class extends Inline {
    pushPending() {
      const start = pending.get(this) ?? this.pos - this.pending.length;
      const token = super.pushPending();
      setRuns(token, literal(start, token.content.length));
      return token;
    }
  };
  // Keep markdown-it's tokenizer, wrapping each rule instead of parsing again.
  const inlineRules = md.inline.ruler.getRules.bind(md.inline.ruler);
  const wrappedInline = new WeakMap<Function, ReturnType<typeof inlineRules>[number]>();
  md.inline.ruler.getRules = mapRules(inlineRules, (rule) => {
    let wrapped = wrappedInline.get(rule);
    if (!wrapped) {
      wrapped = (state, silent) => {
        if (silent) return rule(state, silent);
        const start = state.pos,
          count = state.tokens.length,
          oldPending = state.pending;
        if (!oldPending) pending.set(state, start);
        const ok = rule(state, silent);
        if (!ok) return ok;
        const fresh = state.tokens.slice(count).filter((token) => !locations.has(token));
        const end = state.pos;
        if (fresh.length && fresh.every((token) => token.type === 'text')) {
          let at = start;
          for (const token of fresh) {
            setRuns(token, literal(at, token.content.length));
            at += token.content.length;
          }
        } else {
          for (const token of fresh) {
            if (token.type === 'softbreak' || token.type === 'hardbreak') {
              locations.set(token, { start, end, runs: atom(start, end, 1) });
            } else if (token.type === 'code_inline') {
              let from = start + token.markup.length;
              const raw = state.src.slice(from, end - token.markup.length).replace(/\n/g, ' ');
              if (raw.startsWith(' ') && raw.endsWith(' ') && /[^ ]/.test(raw)) from++;
              setRuns(token, literal(from, token.content.length));
              const location = locations.get(token)!;
              location.start = start;
              location.end = end;
            } else if (token.type === 'link_open') {
              // Recursive label tokens already have their own exact offsets.
              locations.set(token, { start, end });
            } else if (token.type === 'link_close') locations.set(token, { start, end });
            else if (token.type === 'text' && fresh.some((t) => t.type === 'link_open')) {
              let from = start;
              if (state.src[start] === '<') from++;
              else if (state.src[start] === ':')
                from = start - (oldPending.match(/[a-zA-Z][a-zA-Z0-9+.-]{0,9}$/)?.[0].length ?? 0);
              const length = state.src[start] === '<' ? end - start - 2 : end - from;
              setRuns(
                token,
                token.content.length === length
                  ? literal(from, length)
                  : atom(from, from + length, token.content.length),
              );
            } else setRuns(token, atom(start, end, token.content.length));
          }
        }
        return ok;
      };
      wrappedInline.set(rule, wrapped);
    }
    return wrapped;
  });
  // Preserve source runs when markdown-it coalesces adjacent text tokens.
  md.inline.ruler2.at('fragments_join', (state) => {
    const output: Token[] = [];
    let level = 0;
    for (const token of state.tokens) {
      if (token.nesting < 0) level--;
      token.level = level;
      if (token.nesting > 0) level++;
      const previous = output.at(-1);
      if (token.type === 'text' && previous?.type === 'text') {
        merge(previous, token);
        output[output.length - 1] = token;
      } else output.push(token);
    }
    state.tokens.splice(0, state.tokens.length, ...output);
  });
  md.inline.ruler2.after('emphasis', 'source_delimiters', (state) => {
    for (const token of state.tokens) {
      const location = locations.get(token);
      if (location && token.type === 'strong_open') location.start--;
      if (location && token.type === 'strong_close') location.end++;
    }
  });
  md.core.ruler.at('linkify', sourceLinkify);
  md.core.ruler.at('replacements', sourceReplacements);
  const quotes = md.core.ruler.getRules('').find((rule) => rule.name === 'smartquotes');
  if (quotes)
    md.core.ruler.at('smartquotes', (state) => {
      const tokens = state.tokens;
      state.tokens = tokens.filter((token) => !reused.has(token));
      try {
        quotes(state);
      } finally {
        state.tokens = tokens;
      }
    });
  md.core.ruler.at('inline', (state) => {
    const cache = state.env.sourceCache as SourceCache | undefined;
    const references = JSON.stringify(state.env.references ?? {});
    for (const token of state.tokens) {
      if (token.type !== 'inline') continue;
      const inlineBase = locations.get(token)?.runs ?? [];
      const key = inlineBase[0]?.start ?? -1;
      const signature = JSON.stringify(inlineBase) + references;
      cacheKeys.set(token, { key, signature });
      const cached = key >= 0 ? cache?.previous.get(key) : undefined;
      if (cached && cached.content === token.content && cached.signature === signature) {
        token.children = cached.children;
        reused.add(token);
        cache!.next.set(key, cached);
        continue;
      }
      md.inline.parse(token.content, md, state.env, token.children!);
      for (const child of token.children!) {
        const location = locations.get(child);
        if (!location || !inlineBase.length) continue;
        const runs = (location.runs ?? []).flatMap((run) => {
          const sliced = sliceRuns(inlineBase, run.start, run.end);
          if (!sliced.length) return [];
          return run.atomic ? atom(sliced[0]!.start, sliced.at(-1)!.end, run.length) : sliced;
        });
        const bounds = sliceRuns(inlineBase, location.start, location.end);
        if (bounds.length) locations.set(child, { runs, start: bounds[0]!.start, end: bounds.at(-1)!.end });
        else locations.delete(child);
      }
    }
  });
  md.core.ruler.at('text_join', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || reused.has(block)) continue;
      const output: Token[] = [];
      for (const token of block.children!) {
        if (token.type === 'text_special') token.type = 'text';
        const previous = output.at(-1);
        if (token.type === 'text' && previous?.type === 'text') {
          merge(previous, token);
          output[output.length - 1] = token;
        } else output.push(token);
      }
      const stack: Token[] = [];
      for (const token of output) {
        if (token.nesting === 1) stack.push(token);
        else if (token.nesting === -1) {
          const opener = stack.pop(),
            start = opener && locations.get(opener),
            end = locations.get(token);
          if (start && end) start.end = Math.max(start.end, end.end);
        }
      }
      block.children = output;
      const cache = state.env.sourceCache as SourceCache | undefined,
        key = cacheKeys.get(block);
      if (cache && key && key.key >= 0)
        cache.next.set(key.key, { content: block.content, signature: key.signature, children: output });
    }
  });
}

// Linkify's match indices describe transformations of a text token exactly.
// Reuse those indices rather than looking for rendered labels in the source.
function sourceLinkify(state: StateCore) {
  if (!state.md.options.linkify) return;
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children || reused.has(block)) continue;
    const output: Token[] = [];
    let links = 0;
    for (const token of block.children) {
      if (token.type === 'link_open') links++;
      if (token.type === 'link_close') links--;
      const matches = token.type === 'text' && !links ? state.md.linkify.match(token.content) : null;
      if (!matches?.length) {
        output.push(token);
        continue;
      }
      const location = locations.get(token);
      let at = 0;
      const addText = (from: number, to: number, content = token.content.slice(from, to)) => {
        if (from === to) return;
        const next = new state.Token('text', '', 0);
        next.content = content;
        next.level = token.level;
        if (location?.runs) {
          const runs = sliceRuns(location.runs, from, to);
          if (runs.length)
            setRuns(next, content.length === to - from ? runs : atom(runs[0]!.start, runs.at(-1)!.end, content.length));
        }
        output.push(next);
      };
      for (const match of matches) {
        const href = state.md.normalizeLink(match.url);
        if (!state.md.validateLink(href)) continue;
        addText(at, match.index);
        const open = new state.Token('link_open', 'a', 1);
        open.attrs = [['href', href]];
        open.info = 'auto';
        open.markup = 'linkify';
        open.level = token.level;
        output.push(open);
        const label = state.md
          .normalizeLinkText(match.schema ? match.text : `http://${match.text}`)
          .replace(match.schema ? /$^/ : /^http:\/\//, '');
        addText(match.index, match.lastIndex, label);
        const close = new state.Token('link_close', 'a', -1);
        close.info = 'auto';
        close.markup = 'linkify';
        close.level = token.level;
        output.push(close);
        at = match.lastIndex;
      }
      addText(at, token.content.length);
    }
    block.children = output;
  }
}
function sourceReplacements(state: StateCore) {
  if (!state.md.options.typographer) return;
  const replace = (token: Token, pattern: RegExp, replacement: (match: RegExpExecArray) => string, preserve = 0) => {
    const input = token.content,
      location = locations.get(token),
      runs: SourceRun[] = [];
    let text = '',
      at = 0;
    for (const match of input.matchAll(pattern)) {
      const pos = match.index!,
        value = replacement(match);
      text += input.slice(at, pos) + value;
      if (location?.runs) {
        runs.push(...sliceRuns(location.runs, at, pos + preserve));
        const changed = sliceRuns(location.runs, pos + preserve, pos + match[0].length);
        if (changed.length) runs.push(...atom(changed[0]!.start, changed.at(-1)!.end, value.length - preserve));
      }
      at = pos + match[0].length;
    }
    if (!at) return;
    text += input.slice(at);
    token.content = text;
    if (location?.runs) {
      runs.push(...sliceRuns(location.runs, at, input.length));
      setRuns(token, runs);
    }
  };
  for (const block of state.tokens) {
    if (reused.has(block)) continue;
    let auto = 0;
    for (const token of block.children ?? []) {
      if (token.type === 'link_open' && token.info === 'auto') auto++;
      if (token.type === 'link_close' && token.info === 'auto') auto--;
      if (token.type !== 'text' || auto || !/\((?:c|tm|r)\)|\+-|\.\.|[?!]{4}|,,|--/i.test(token.content)) continue;
      replace(token, /\((c|tm|r)\)/gi, (m) => ({ c: '©', tm: '™', r: '®' })[m[1]!.toLowerCase() as 'c' | 'tm' | 'r']);
      replace(token, /\+-/g, () => '±');
      replace(token, /\.{2,}/g, () => '…');
      replace(token, /([?!])…/g, (m) => m[1] + '..', 1);
      replace(token, /([?!]){4,}/g, (m) => m[1]!.repeat(3));
      replace(token, /,{2,}/g, () => ',');
      replace(token, /(?<=[^-])---(?=[^-]|$)|^---(?=[^-]|$)/gm, () => '—');
      replace(token, /(?<=\s)--(?=\s|$)|^--(?=\s|$)/gm, () => '–');
      replace(token, /(?<=[^-\s])--(?=[^-\s]|$)/gm, () => '–');
    }
  }
}

export function sourceRenderer(md: MarkdownIt) {
  const attribute = (token: Token, env: unknown, atomic = false, structural = false) => {
    const context = env as { originalAt?: (position: number) => number; sourceEntries?: SourceMapping[] } | undefined;
    const location = locations.get(token),
      at = context?.originalAt,
      entries = context?.sourceEntries;
    if (!location || !at || !entries) return '';
    const entry: SourceMapping = { start: at(location.start), end: at(location.end) };
    if (atomic) entry.atomic = true;
    else if (!structural && location.runs)
      entry.runs = location.runs.map((run) => ({ ...run, start: at(run.start), end: at(run.end) }));
    const index = entries.push(entry) - 1;
    return ` data-md="${index}"`;
  };
  for (const name of [
    'strong_open',
    'em_open',
    's_open',
    'link_open',
    'paragraph_open',
    'heading_open',
    'list_item_open',
    'blockquote_open',
    'tr_open',
  ]) {
    const original = md.renderer.rules[name];
    md.renderer.rules[name] = (tokens, index, options, env, renderer) => {
      const html = original
        ? original(tokens, index, options, env, renderer)
        : renderer.renderToken(tokens, index, options);
      if (!html) return html;
      const attr = attribute(tokens[index]!, env, false, true);
      return attr ? html.replace(/^<[\w-]+/, (tag) => tag + attr) : html;
    };
  }
  const text = md.renderer.rules.text!;
  md.renderer.rules.text = (tokens, index, options, env, renderer) => {
    const html = text(tokens, index, options, env, renderer);
    if (!html) return html;
    const attr = attribute(tokens[index]!, env);
    return attr ? `<span${attr}>${html}</span>` : html;
  };
  for (const name of ['softbreak', 'hardbreak']) {
    const original = md.renderer.rules[name]!;
    md.renderer.rules[name] = (tokens, index, options, env, renderer) => {
      const html = original(tokens, index, options, env, renderer),
        attr = attribute(tokens[index]!, env);
      return attr ? html.replace('\n', `<span${attr}>\n</span>`) : html;
    };
  }
  for (const name of ['code_inline', 'math_inline', 'math_block', 'fence', 'code_block']) {
    const original = md.renderer.rules[name];
    if (!original) continue;
    md.renderer.rules[name] = (tokens, index, options, env, renderer) => {
      const html = original(tokens, index, options, env, renderer);
      const math = name.startsWith('math_') || (name === 'fence' && tokens[index]!.info.trim() === 'math');
      const attr = attribute(tokens[index]!, env, math);
      if (!attr) return html;
      return math ? `<span${attr} data-md-atom="">${html}</span>` : html.replace(/<code(?=[\s>])/, `<code${attr}`);
    };
  }
}

// Table cell positions follow markdown-it's escaped-pipe splitting, using the
// parser's line start and indentation offsets, including nested list/quote rows.
function tableCells(state: StateBlock, line: number): SourceRun[][] {
  let start = state.bMarks[line]! + state.tShift[line]!,
    end = state.eMarks[line]!;
  while (start < end && /\s/.test(state.src[start]!)) start++;
  while (end > start && /\s/.test(state.src[end - 1]!)) end--;
  const cells: { text: string; runs: SourceRun[] }[] = [];
  let text = '',
    runs: SourceRun[] = [],
    chunk = start;
  for (let pos = start; pos < end; pos++) {
    if (state.src[pos] !== '|') continue;
    const escaped = pos > start && state.src[pos - 1] === '\\';
    text += state.src.slice(chunk, escaped ? pos - 1 : pos);
    runs.push(...literal(chunk, (escaped ? pos - 1 : pos) - chunk));
    if (escaped) {
      text += '|';
      runs.push(...atom(pos - 1, pos + 1, 1));
    } else {
      cells.push({ text, runs });
      text = '';
      runs = [];
    }
    chunk = pos + 1;
  }
  text += state.src.slice(chunk, end);
  runs.push(...literal(chunk, end - chunk));
  cells.push({ text, runs });
  if (cells[0]?.text === '') cells.shift();
  if (cells.at(-1)?.text === '') cells.pop();
  return cells.map((cell) => trimRuns(cell.text, cell.runs));
}
