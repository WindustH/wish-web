import type { ChipsItem, GroupBlock, GroupEntry, GroupItem, TextItem } from './grouping.ts';

export const ALBUM_MIN_IMAGES = 4;
export const ALBUM_WIDTH = 288;
export const ALBUM_GAP = 6;
export const ALBUM_ASPECT_RATIO = 4 / 3;
export const ALBUM_PREVIEW_LIMIT = 9;
export const albumColumns = (count: number) => count === 4 ? 2 : 3;
export function albumPreview(count: number) {
  const visible = count > ALBUM_PREVIEW_LIMIT ? ALBUM_PREVIEW_LIMIT - 1 : count;
  const hidden = count - visible;
  return { visible, hidden, cells: visible + (hidden > 0 ? 1 : 0) };
}
export const albumHeight = (count: number, width: number) => {
  const columns = albumColumns(count);
  const rows = Math.ceil(albumPreview(count).cells / columns);
  return rows * (Math.min(ALBUM_WIDTH, width) - (columns - 1) * ALBUM_GAP) / columns / ALBUM_ASPECT_RATIO + (rows - 1) * ALBUM_GAP;
};

/** Consecutive images within a message; words and files keep their exact positions. */
export function imageParts<T extends { type: string }>(blocks: readonly T[]) {
  const parts: ({ type: 'block'; block: T } | { type: 'album'; blocks: T[] })[] = [];
  let images: T[] = [];
  const flush = () => {
    if (images.length >= ALBUM_MIN_IMAGES) parts.push({ type: 'album', blocks: images });
    else parts.push(...images.map(block => ({ type: 'block' as const, block })));
    images = [];
  };
  for (const block of blocks) {
    if (block.type === 'image') images.push(block);
    else { flush(); parts.push({ type: 'block', block }); }
  }
  flush();
  return parts;
}

type Row<E extends GroupEntry> = GroupItem<E> | TextItem<E> | ChipsItem<E>;
export interface ImageAlbumItem<E extends GroupEntry = GroupEntry> {
  type: 'image_album'; key: string; items: TextItem<E>[];
}

/** A display projection only: original messages, identities and attachment blocks stay intact. */
export function imageAlbums<E extends GroupEntry>(rows: readonly Row<E>[]): (Row<E> | ImageAlbumItem<E>)[] {
  const result: (Row<E> | ImageAlbumItem<E>)[] = [];
  let pending: TextItem<E>[] = [];
  let originals: Row<E>[] = [];
  let between: ChipsItem<E>[] = [];
  const flush = () => {
    const count = pending.reduce((n, item) => n + item.blocks.length, 0);
    if (count >= ALBUM_MIN_IMAGES) result.push({ type: 'image_album', key: pending[0]!.key, items: pending });
    else result.push(...originals);
    // Work after the last picture belongs after the album, until another picture arrives.
    result.push(...between);
    pending = [];
    originals = [];
    between = [];
  };
  for (const row of rows) {
    // Tool-produced pictures are native User messages. inlineChips leaves the work between
    // those pictures in standalone rail hosts, unlike work before Assistant pictures. Both
    // kinds of rail-only activity must be transparent to visual image grouping.
    if (row.type === 'chips' && pending.length) { between.push(row); continue; }
    const blocks = row.type === 'entry' ? row.blocks.filter(block => block.type !== 'text' || block.text?.trim()) : [];
    const imagesOnly = row.type === 'entry'
      && (row.entry.kind === 'user_message' || row.entry.kind === 'assistant_message')
      && blocks.length > 0 && blocks.every((b: GroupBlock) => b.type === 'image');
    if (!imagesOnly) { flush(); result.push(row); continue; }
    const item = row as TextItem<E>;
    if (pending[0] && pending[0].entry.kind !== item.entry.kind) flush();
    const bridge = between.flatMap(host => host.chips);
    originals.push(...between, row);
    pending.push({ ...item, blocks, before: [...bridge, ...(item.before ?? [])] });
    between = [];
  }
  flush();
  return result;
}
