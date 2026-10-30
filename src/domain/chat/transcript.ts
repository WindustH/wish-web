import type { GroupEntry, GroupItem, TextItem, ChipsItem } from './grouping.ts';
import type { ImageAlbumItem } from './imageAlbums.ts';

/** The rows rendered by a conversation; execution status belongs beside this projection. */
export type TranscriptRow<E extends GroupEntry = GroupEntry> =
  GroupItem<E> | TextItem<E> | ChipsItem<E> | ImageAlbumItem<E>;
