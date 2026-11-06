import { validReference, type ReplyReference } from '../replyReferences.ts';
import { splitAttachmentText } from '../attachmentPlaceholders.ts';
// Display content blocks of a history entry.
export type ContentBlock =
  | { type: 'reply'; reference: ReplyReference }
  | { type: 'text'; text: string }
  | { type: 'reasoning'; display_summary: boolean; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: any }
  | AttachmentContent;
// Native image blocks spread the backend's image fields; attachment parts name a session blob.
export interface AttachmentContent {
  type: 'image' | 'file';
  blob_id?: string;
  filename?: string | null;
  image_id?: string;
  byte_count?: number;
  placeholder?: string;
  mime_type?: string;
  data_base64?: string;
}

// Use persisted display parts when available; native history remains readable.
export function orderedUserContent(message: any, sessionId: string, fallback: ContentBlock[]): ContentBlock[] {
  const custom = message.metadata?.custom;
  if (typeof custom?.reply_draft === 'string' && Array.isArray(custom.reply_references)) {
    const refs = custom.reply_references.filter(validReference);
    const files = message.metadata?.attachments ?? [];
    const tokens = [
      ...refs.map((reference: ReplyReference) => ({
        placeholder: `<reply-${reference.id}>`,
        reference,
        file: undefined,
      })),
      ...files.map((file: any) => ({ placeholder: file.placeholder, reference: undefined, file })),
    ];
    return splitAttachmentText(custom.reply_draft, tokens).flatMap((part): ContentBlock[] => {
      if (part.type === 'text') return [{ type: 'text', text: part.text }];
      if (part.attachment.reference) return [{ type: 'reply', reference: part.attachment.reference }];
      const file = part.attachment.file;
      return file
        ? [{ type: file.kind, blob_id: `${sessionId}/${file.id}`, filename: file.name, placeholder: file.placeholder }]
        : [];
    });
  }
  const parts = message.metadata?.input_parts;
  const attachments = message.metadata?.attachments ?? [];
  if (!Array.isArray(parts)) return fallback;
  return parts.flatMap((part): ContentBlock[] => {
    if (part.type === 'text') return [{ type: 'text', text: part.text }];
    const file = attachments[part.index];
    return file
      ? [
          {
            type: file.kind,
            blob_id: `${sessionId}/${file.id}`,
            filename: file.name,
            image_id: file.id,
            byte_count: file.byte_count,
            placeholder: file.placeholder,
          },
        ]
      : [];
  });
}
export function userBubbles(content: readonly ContentBlock[] | null | undefined): ContentBlock[] {
  const bubbles: ContentBlock[] = [];
  for (const block of content ?? []) {
    if (block.type === 'text') {
      if (!block.text) continue;
      const previous = bubbles.at(-1);
      if (previous?.type === 'text') previous.text += block.text;
      else bubbles.push({ ...block });
    } else if (block.type === 'image' || block.type === 'file' || block.type === 'reply') bubbles.push(block);
  }
  return bubbles.filter((block) => block.type !== 'text' || block.text.trim());
}
