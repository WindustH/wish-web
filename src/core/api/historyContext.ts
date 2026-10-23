import type { EntryView } from './projections.ts';

type ContextKind = 'boundary' | 'activity' | 'ignore' | 'user_image' | 'assistant_image';
function kind(entry: EntryView): ContextKind {
  if (entry.kind === 'history_event') return 'ignore';
  if (entry.kind === 'tool_result') return 'activity';
  if (entry.kind === 'system_message' || entry.kind === 'developer_message') {
    return entry.payload?.metadata?.source === 'ask_user_answer' ? 'boundary' : 'activity';
  }
  if (entry.kind !== 'user_message' && entry.kind !== 'assistant_message') return 'boundary';
  const blocks = entry.payload?.content ?? [];
  if (blocks.some(b => b.type === 'file' || (b.type === 'text' && b.text.trim()) || (b.type === 'tool_call' && b.name === 'ask_user'))) return 'boundary';
  if (blocks.some(b => b.type === 'image')) return entry.kind === 'user_message' ? 'user_image' : 'assistant_image';
  return entry.kind === 'assistant_message' ? 'activity' : 'boundary';
}

export interface ContextPage { items: EntryView[]; has_more: boolean }

/** Finish the visual group cut by a transport page, then publish it in one merge. The original
 * page keeps its order. Extra pages stop at the first real message boundary; unrelated older
 * or newer groups stay paged. No image is fetched/decoded separately just to count the group. */
export async function completeHistoryContext(
  initial: ContextPage, order: 'asc' | 'desc',
  read: (edge: number) => Promise<ContextPage>, signal?: AbortSignal,
): Promise<ContextPage> {
  const items = [...initial.items];
  if (!initial.has_more || !items.length) return initial;
  let context: ContextKind = 'activity';
  for (let i = items.length - 1; i >= 0; i--) {
    const next = kind(items[i]!);
    if (next === 'ignore' || next === 'activity') continue;
    if (i === items.length - 1 && next === 'boundary') return initial;
    context = next === 'boundary' ? 'activity' : next;
    break;
  }
  // Ignored outcomes can trail a boundary, so inspect the actual edge separately.
  const edgeKind = [...items].reverse().map(kind).find(value => value !== 'ignore');
  if (edgeKind === 'boundary') return initial;
  let more: boolean = initial.has_more;
  while (more) {
    signal?.throwIfAborted();
    const edge = items.at(-1)!.seq;
    const page = await read(edge);
    signal?.throwIfAborted();
    const fresh = page.items.filter(item => order === 'desc' ? item.seq < edge : item.seq > edge);
    if (!fresh.length) {
      if (page.has_more) throw new Error('History pagination did not advance');
      return { items, has_more: false };
    }
    for (let i = 0; i < fresh.length; i++) {
      const item = fresh[i]!, next = kind(item);
      if (next === 'boundary') {
        items.push(item);
        return { items, has_more: page.has_more || i < fresh.length - 1 };
      }
      if (next !== 'ignore' && next !== 'activity' && next !== context) {
        return { items, has_more: true }; // another speaker's pictures form a separate group
      }
      items.push(item);
    }
    more = page.has_more;
  }
  return { items, has_more: more };
}
