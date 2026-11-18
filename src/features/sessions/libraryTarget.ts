import { ApiError } from '../../core/api/client.ts';
import { directoriesList, linkSessionFile } from '../../core/api/endpoints.ts';
import type { DirectoryListing } from '../../core/api/types.ts';
import type { BlobMention, FileMention } from '../../core/blobMentions.ts';
import type { ReplyReference } from '../../core/replyReferences.ts';

type DirectoryTarget = { owner: string; directory: DirectoryListing };
export type LibraryTarget = { request: number; target: BlobMention | DirectoryTarget | ReplyReference };

export async function openLocalMention(
  owner: string,
  file: Extract<FileMention, { kind: 'local' }>,
): Promise<BlobMention | DirectoryTarget> {
  try {
    const blob = await linkSessionFile(owner, file.path, true);
    return { ...file, owner, id: blob.id };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 400 || error.detail !== 'linked path must be a regular file')
      throw error;
    // Directory mentions are read-only previews. Browsing must not add a persistent Library link.
    return { owner, directory: await directoriesList(file.path, true) };
  }
}
