import type { LibraryBlob } from '../../core/api/types.ts';
import type { EntryView } from '../../core/api/projections.ts';
import { codeLanguage } from '../../ui/codeLanguage.ts';

export type BlobKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'website' | 'file';
/** Linked directory listings provide filenames without opening files to sniff their contents. */
export function linkedFileKind(name: string): BlobKind {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg', 'heic', 'heif'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac'].includes(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  return codeLanguage(name) ? 'text' : 'file';
}
const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
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
  if (blob.mime_type === 'application/vnd.wish.website') return 'website';
  for (const kind of ['image', 'video', 'audio', 'text'] as const)
    if (blob.mime_type.startsWith(`${kind}/`)) return kind;
  if (blob.mime_type === 'application/pdf') return 'pdf';
  return codeLanguage(blob.name ?? blob.local_path ?? '', blob.mime_type) ? 'text' : 'file';
}
export const blobIcon = (kind: BlobKind) =>
  ({
    website: 'globe',
    image: 'image',
    video: 'video',
    audio: 'music',
    pdf: 'instruction',
    text: 'instruction',
    file: 'paperclip',
  })[kind];
export function blobName(blob: LibraryBlob, names: ReadonlyMap<string, string>) {
  return (
    blob.display_name ||
    blob.name ||
    names.get(blob.id) ||
    `${blob.id.slice(0, 12)}.${extensions[blob.mime_type] ?? 'bin'}`
  );
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
