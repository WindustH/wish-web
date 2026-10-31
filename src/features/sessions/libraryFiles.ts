import type { LibraryBlob } from '../../core/api/types.ts';
import type { EntryView } from '../../core/api/projections.ts';

export type BlobKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file';
const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/zip': 'zip',
};
export function blobKind(blob: LibraryBlob): BlobKind {
  for (const kind of ['image', 'video', 'audio', 'text'] as const)
    if (blob.mime_type.startsWith(`${kind}/`)) return kind;
  return blob.mime_type === 'application/pdf' ? 'pdf' : 'file';
}
export const blobIcon = (kind: BlobKind) =>
  ({ image: 'image', video: 'video', audio: 'audio', pdf: 'instruction', text: 'instruction', file: 'paperclip' })[
    kind
  ];
export function blobName(blob: LibraryBlob, names: ReadonlyMap<string, string>) {
  return names.get(blob.id) || `${blob.id.slice(0, 12)}.${extensions[blob.mime_type] ?? 'bin'}`;
}
/** Names are display metadata; the catalog, never the loaded history window, owns membership. */
export function attachmentNames(entries: EntryView[]) {
  const names = new Map<string, string>();
  for (const entry of entries) {
    const attachments: unknown = entry.payload.metadata?.attachments;
    if (!Array.isArray(attachments)) continue;
    for (const item of attachments)
      if (item && typeof item.id === 'string' && typeof item.name === 'string' && item.name)
        names.set(item.id, item.name);
  }
  return names;
}
