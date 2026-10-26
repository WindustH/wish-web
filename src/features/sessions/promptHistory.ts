import type { EntryView } from '../../core/api/projections.ts';
import type { AttachmentContent } from '../../core/api/userContent.ts';

export interface HistoricalAttachment {
  kind: 'image' | 'file'; blob_id: string; filename?: string; mime_type?: string; placeholder?: string;
}
export interface HistoricalPrompt { text: string; attachments: HistoricalAttachment[] }

/** Only authored user messages; projected tool answers and group messages are excluded. */
export function sessionPrompts(entries: readonly EntryView[], owner?: string): HistoricalPrompt[] {
  return entries.filter(entry => entry.kind === 'user_message').map(entry => {
    const metadata = entry.payload.metadata;
    // The persisted input is authoritative, including legacy attachments without inline tokens.
    if (owner && typeof metadata?.input_text === 'string' && Array.isArray(metadata.attachments)) {
      return { text: metadata.input_text as string, attachments: metadata.attachments
        .filter((file: { kind: string; id?: string }) => (file.kind === 'image' || file.kind === 'file') && file.id)
        .map((file: { kind: 'image' | 'file'; id: string; name?: string; placeholder?: string }) => ({
          kind: file.kind, blob_id: `${owner}/${file.id}`, filename: file.name ?? undefined, placeholder: file.placeholder,
        })) as HistoricalAttachment[] };
    }
    const attachments: HistoricalAttachment[] = [];
    const text = entry.payload.content.map(block => {
      if (block.type === 'text') return block.text;
      if (block.type !== 'image' && block.type !== 'file') return '';
      const file = block as AttachmentContent;
      if (!file.blob_id) return '';
      const placeholder = file.placeholder ?? `<${file.type}-${file.blob_id.split('/').at(-1)}>`;
      if (!attachments.some(item => item.placeholder === placeholder)) attachments.push({ kind: file.type, blob_id: file.blob_id, filename: file.filename ?? undefined,
        mime_type: file.mime_type, placeholder });
      return placeholder;
    }).join('');
    return { text, attachments };
  }).filter(prompt => prompt.text || prompt.attachments.length);
}

/** Snapshots belong to a single browsing round and never cross a session boundary. */
export function createPromptHistory<T>() {
  let prompts: T[] | null = null;
  let position = 0;
  return {
    get active() { return prompts !== null; },
    get atOldest() { return position === 0; },
    prepend(older: T[]) { if (prompts) { prompts.unshift(...older); position += older.length; } },
    move(direction: -1 | 1, current: T, history: () => T[]): T | undefined {
      if (!prompts) {
        if (direction === 1) return;
        prompts = [...history(), current];
        position = prompts.length - 1;
      }
      const next = position + direction;
      if (next < 0 || next >= prompts.length) return;
      prompts[position] = current;
      position = next;
      const prompt = prompts[position];
      if (position === prompts.length - 1) { prompts = null; position = 0; }
      return prompt;
    },
    reset() { prompts = null; position = 0; },
  };
}
