interface Placeheld { placeholder?: string }
export type AttachmentTextPart<T> =
  | { type: 'text'; text: string; start: number; attachment?: undefined }
  | { type: 'attachment'; text: string; start: number; attachment: T };

export const attachmentsForMessage = <T extends Placeheld>(text: string, attachments: readonly T[]) => attachments.filter(item =>
  !item.placeholder || text.includes(item.placeholder));

// Only recognized attachment tokens become atomic editor nodes; ordinary text
// resembling a token stays text when its attachment is unavailable.
export function splitAttachmentText<T extends Placeheld>(text: string, attachments: readonly T[]) {
  const tokens = new Map(attachments.filter(a => a.placeholder).map(a => [a.placeholder, a]));
  const parts: AttachmentTextPart<T>[] = [];
  let offset = 0;
  for (const match of text.matchAll(/<(?:image|file|paste)-[a-f0-9]{64}>/g)) {
    const attachment = tokens.get(match[0]);
    if (!attachment) continue;
    if (match.index > offset) parts.push({ type: 'text', text: text.slice(offset, match.index), start: offset });
    parts.push({ type: 'attachment', text: match[0], start: match.index, attachment });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ type: 'text', text: text.slice(offset), start: offset });
  return parts;
}
